/**
 * Built-in tool definitions and implementations.
 * Each entry exposes a ToolDefinition (sent to the LLM) and an execute function.
 */

import type { ToolDefinition, ToolResult } from '@/types';
import { hybridSearch } from '@/services/search/HybridSearch';
import { getIndex } from '@/services/indexer/IndexStore';
import { readNote, createNote, appendToNote } from '@/services/vault/VaultWriter';
import { getTodayDateString, getTimeHeading } from '@/utils/dateUtils';

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

function executeSearchVault(toolCallId: string, args: Record<string, unknown>): ToolResult {
  const query = String(args.query ?? '');
  const limit = Number(args.limit ?? 5);
  const index = getIndex();
  const results = hybridSearch(index, query, undefined, limit);

  if (results.length === 0) {
    return { toolCallId, name: 'search_vault', output: 'No notes found matching that query.' };
  }

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.note.title}** (${r.note.id})\n   ${r.note.summary || 'No summary.'}`)
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

function executeListNotes(toolCallId: string, args: Record<string, unknown>): ToolResult {
  const index = getIndex();
  const typeFilter = args.type ? String(args.type) : null;
  const tagFilter = args.tag ? String(args.tag) : null;
  const limit = Number(args.limit ?? 20);

  let notes = Object.values(index.notes);

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
 * Actually execute a confirmed pending write.
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
}
