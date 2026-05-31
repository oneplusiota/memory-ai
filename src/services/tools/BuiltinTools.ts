/**
 * Built-in tool definitions and implementations.
 * Each entry exposes a ToolDefinition (sent to the LLM) and an execute function.
 */

import type { ToolDefinition, ToolResult } from '@/types';
import { searchNotes } from '@/services/search/HybridSearch';
import { getAllNotes, upsertNote, upsertLinks, setEmbedding } from '@/services/db/VaultDB';
import { embed as gloveEmbed, isReady as gloveReady } from '@/services/search/GloveService';
import { parseNote } from '@/services/vault/MarkdownParser';
import { readNote, createNote, appendToNote, appendToDailyNote } from '@/services/vault/VaultWriter';
import { extractDensestParagraph } from '@/utils/textUtils';
import { getTodayDateString, getTimeHeading } from '@/utils/dateUtils';
import { noteTitle } from '@/utils/pathUtils';

// ── Tool definitions (sent to LLM) ─────────────────────────────────────────

export const BUILTIN_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_vault',
    description: 'Search the user\'s vault (Obsidian notes) for notes relevant to a query. Returns titles, summaries and paths of the top matching notes.',
    parameters: [
      { name: 'query', description: 'The search query', type: 'string', required: true },
      { name: 'limit', description: 'Maximum number of results to return (default 5)', type: 'number', required: false },
    ],
    kind: 'builtin',
  },
  {
    name: 'read_note',
    description: 'Read the full markdown content of a specific note from the vault by its vault-relative path (e.g. "atoms/My-Note.md").',
    parameters: [
      { name: 'path', description: 'Vault-relative path to the note, e.g. atoms/My-Note.md', type: 'string', required: true },
    ],
    kind: 'builtin',
  },
  {
    name: 'list_notes',
    description: 'List notes in the vault, optionally filtered by type or tag.',
    parameters: [
      { name: 'type', description: 'Filter by note type: person | project | concept | decision | area | tool | daily | conversation', type: 'string', required: false },
      { name: 'tag', description: 'Filter by tag', type: 'string', required: false },
      { name: 'limit', description: 'Maximum number of results (default 20)', type: 'number', required: false },
    ],
    kind: 'builtin',
  },
  {
    name: 'create_note',
    description: 'Create a new markdown note in the vault. Requires user confirmation before writing.',
    parameters: [
      { name: 'path', description: 'Vault-relative path, e.g. atoms/My-New-Note.md', type: 'string', required: true },
      { name: 'content', description: 'Full markdown content including frontmatter', type: 'string', required: true },
    ],
    kind: 'builtin',
  },
  {
    name: 'update_note',
    description: 'Append content to an existing note in the vault. Requires user confirmation before writing.',
    parameters: [
      { name: 'path', description: 'Vault-relative path to the existing note', type: 'string', required: true },
      { name: 'content', description: 'Markdown content to append', type: 'string', required: true },
    ],
    kind: 'builtin',
  },
  {
    name: 'append_daily_note',
    description: "Append a rich log entry to today's daily note (creates the note if it doesn't exist). ALWAYS call this after every vault save — single note or full conversation. The entry must be a meaningful ### HH:MM block, not a one-liner.",
    parameters: [
      {
        name: 'entry',
        description: 'Markdown log entry. Must use this format:\n### HH:MM — [Descriptive title]\n**What happened:** [1-3 sentence summary]\n**Key insight / next step:** [takeaway, omit if none]\n[[Atom1]], [[Atom2]]',
        type: 'string',
        required: true,
      },
    ],
    kind: 'builtin',
  },
  {
    name: 'get_date_time',
    description: 'Get the current date and time.',
    parameters: [],
    kind: 'builtin',
  },
];

// ── Tool implementations ───────────────────────────────────────────────────

export async function executeBuiltinTool(
  toolCallId: string,
  name: string,
  args: Record<string, unknown>,
  vaultUri: string,
): Promise<ToolResult> {
  switch (name) {
    case 'search_vault':
      return executeSearchVault(toolCallId, args);

    case 'read_note':
      return executeReadNote(toolCallId, args, vaultUri);

    case 'list_notes':
      return executeListNotes(toolCallId, args);

    case 'create_note':
      return executeCreateNote(toolCallId, args);

    case 'update_note':
      return executeUpdateNote(toolCallId, args);

    case 'append_daily_note': {
      const entry = String(args.entry ?? '');
      if (!entry) return { toolCallId, name, output: 'Error: entry is required.' };
      const dailyPath = await appendToDailyNote(vaultUri, entry);
      return { toolCallId, name, output: `Appended to daily note at ${dailyPath}.` };
    }

    case 'get_date_time':
      return {
        toolCallId,
        name,
        output: `Current date: ${getTodayDateString()}, time: ${getTimeHeading()}`,
      };

    default:
      return { toolCallId, name, output: `Unknown built-in tool: ${name}` };
  }
}

async function executeSearchVault(toolCallId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '');
  const limit = Number(args.limit ?? 5);

  const allNotes = await getAllNotes();
  const results = searchNotes(allNotes, query, limit);

  if (results.length === 0) {
    // Fall back to most recently modified notes so the AI can still find recently logged entries
    const recent = [...allNotes]
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 5);
    if (recent.length === 0) {
      return { toolCallId, name: 'search_vault', output: 'No notes found matching that query and the vault appears to be empty.' };
    }
    const formatted = recent
      .map((n, i) => `${i + 1}. **${n.title}** (${n.id})\n   ${(n.semanticSummary ?? n.summary) || 'No summary.'}`)
      .join('\n');
    return {
      toolCallId,
      name: 'search_vault',
      output: `No notes matched the keyword search. Here are the 5 most recently modified notes — check if any contain the information:\n${formatted}`,
    };
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.note.title}** (${r.note.id})\n   ${(r.note.semanticSummary ?? r.note.summary) || 'No summary.'}`)
    .join('\n');
  return { toolCallId, name: 'search_vault', output: `Found ${results.length} notes:\n${formatted}` };
}

async function executeReadNote(
  toolCallId: string,
  args: Record<string, unknown>,
  vaultUri: string,
): Promise<ToolResult> {
  const path = String(args.path ?? '');
  if (!path) return { toolCallId, name: 'read_note', output: 'Error: path is required.' };

  const content = await readNote(vaultUri, path);
  if (content === null) {
    return { toolCallId, name: 'read_note', output: `Note not found: ${path}` };
  }
  return { toolCallId, name: 'read_note', output: content };
}

async function executeListNotes(toolCallId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const typeFilter = args.type ? String(args.type) : null;
  const tagFilter = args.tag ? String(args.tag) : null;
  const limit = Number(args.limit ?? 20);

  let notes = await getAllNotes();

  if (typeFilter) notes = notes.filter(n => n.type === typeFilter);
  if (tagFilter) notes = notes.filter(n => n.tags.includes(tagFilter!));

  notes = notes.slice(0, limit);

  if (notes.length === 0) {
    return { toolCallId, name: 'list_notes', output: 'No notes found matching the filter.' };
  }

  const formatted = notes
    .map(n => `- **${n.title}** (${n.id})${n.type ? ` [${n.type}]` : ''}`)
    .join('\n');
  return { toolCallId, name: 'list_notes', output: `${notes.length} notes:\n${formatted}` };
}

function executeCreateNote(toolCallId: string, args: Record<string, unknown>): ToolResult {
  const path = String(args.path ?? '');
  const content = String(args.content ?? '');
  if (!path || !content) {
    return { toolCallId, name: 'create_note', output: 'Error: path and content are required.' };
  }
  // Return as a pending write — ToolExecutor will require confirmation
  return {
    toolCallId,
    name: 'create_note',
    output: `Ready to create note at "${path}". Awaiting confirmation.`,
    needsConfirmation: true,
    pendingWrite: { path, content, action: 'create' },
  };
}

function executeUpdateNote(toolCallId: string, args: Record<string, unknown>): ToolResult {
  const path = String(args.path ?? '');
  const content = String(args.content ?? '');
  if (!path || !content) {
    return { toolCallId, name: 'update_note', output: 'Error: path and content are required.' };
  }
  return {
    toolCallId,
    name: 'update_note',
    output: `Ready to append to "${path}". Awaiting confirmation.`,
    needsConfirmation: true,
    pendingWrite: { path, content, action: 'update' },
  };
}

/**
 * Actually execute a confirmed pending write, then re-index the note so it
 * is immediately visible to search_vault / list_notes without a manual reindex.
 */
export async function executePendingWrite(
  vaultUri: string,
  pendingWrite: NonNullable<ToolResult['pendingWrite']>,
): Promise<void> {
  if (pendingWrite.action === 'create') {
    await createNote(vaultUri, pendingWrite.path, pendingWrite.content);
  } else {
    await appendToNote(vaultUri, pendingWrite.path, pendingWrite.content);
  }

  // Upsert into VaultDB so the note is immediately searchable
  try {
    const written = await readNote(vaultUri, pendingWrite.path);
    if (written !== null) {
      const parsed = parseNote(written, noteTitle(pendingWrite.path));
      await upsertNote({
        id: pendingWrite.path,
        title: parsed.title,
        tags: parsed.tags,
        aliases: parsed.aliases,
        summary: extractDensestParagraph(parsed.body),
        outlinks: parsed.outlinks,
        type: parsed.type,
        area: parsed.area,
        status: parsed.status,
        lastModified: Date.now(),
      });
      await upsertLinks(pendingWrite.path, parsed.outlinks);

      // Embed immediately if model is loaded
      if (gloveReady()) {
        const vec = gloveEmbed(parsed.body);
        if (vec) await setEmbedding(pendingWrite.path, Array.from(vec));
      }
    }
  } catch {
    // Non-critical — the note is still written to disk
  }
}
