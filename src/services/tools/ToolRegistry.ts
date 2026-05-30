/**
 * ToolRegistry — discovers and parses custom tools stored as .tool.md files in the vault.
 *
 * .tool.md format:
 * ---
 * name: Write Blog Post
 * description: Writes a blog post from your knowledge base on a given topic
 * parameters:
 *   - name: topic
 *     description: The topic to write about
 *     required: true
 *   - name: tone
 *     description: Writing tone (casual, formal, etc.)
 *     required: false
 * output_path: blog/   (optional)
 * ---
 *
 * Body = prompt template. Use {{param_name}} for parameter substitution
 * and {{vault_context}} for injected search results from the vault.
 */

import type { ToolDefinition, ToolParameterDef, ToolResult } from '@/types';
import { scanVaultForMarkdown } from '@/services/vault/VaultScanner';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { searchNotes } from '@/services/search/HybridSearch';
import { getAllNotes } from '@/services/db/VaultDB';
import { llmChat } from '@/services/llm/LLMClient';

// ── Scanning ───────────────────────────────────────────────────────────────

export async function loadCustomTools(vaultUri: string): Promise<ToolDefinition[]> {
  const allFiles = await scanVaultForMarkdown(vaultUri);
  const toolFiles = allFiles.filter(f => f.relativePath.endsWith('.tool.md'));

  const tools: ToolDefinition[] = [];
  for (const file of toolFiles) {
    try {
      const content = await StorageAccessFramework.readAsStringAsync(file.uri);
      const def = parseToolMd(content, file.relativePath);
      if (def) tools.push(def);
    } catch {
      // skip unreadable files
    }
  }
  return tools;
}

// ── Parsing ────────────────────────────────────────────────────────────────

function parseToolMd(content: string, sourcePath: string): ToolDefinition | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const body = fmMatch[2].trim();

  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  const outputPath = fm.match(/^output_path:\s*(.+)$/m)?.[1]?.trim();

  if (!name || !description) return null;

  // Parse parameters block (simple indented list)
  const parameters: ToolParameterDef[] = [];
  const paramBlock = fm.match(/^parameters:\n((?:  -.+\n(?:    .+\n)*)*)/m)?.[1] ?? '';
  const paramEntries = paramBlock.split(/^  - /m).filter(Boolean);
  for (const entry of paramEntries) {
    const pName = entry.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const pDesc = entry.match(/^description:\s*(.+)$/m)?.[1]?.trim();
    const pRequired = entry.match(/^required:\s*(.+)$/m)?.[1]?.trim() !== 'false';
    if (pName && pDesc) {
      parameters.push({ name: pName, description: pDesc, type: 'string', required: pRequired });
    }
  }

  return {
    name: name.replace(/\s+/g, '_').toLowerCase(),
    description,
    parameters,
    kind: 'custom',
    sourcePath,
    promptTemplate: body,
    outputPath,
  };
}

// ── Execution ──────────────────────────────────────────────────────────────

export async function executeCustomTool(
  toolCallId: string,
  def: ToolDefinition,
  args: Record<string, unknown>,
  vaultUri: string,
): Promise<ToolResult> {
  if (!def.promptTemplate) {
    return { toolCallId, name: def.name, output: 'Error: tool has no prompt template.' };
  }

  // Inject vault context if the template uses {{vault_context}}
  let vaultContext = '';
  if (def.promptTemplate.includes('{{vault_context}}')) {
    const query = String(args.topic ?? args.query ?? Object.values(args)[0] ?? def.name);
    const allNotes = await getAllNotes();
    const results = searchNotes(allNotes, query, 5);
    vaultContext = results
      .map(r => `### ${r.note.title}\n${r.note.summary}`)
      .join('\n\n');
  }

  // Substitute all {{param}} placeholders
  let prompt = def.promptTemplate;
  for (const [key, value] of Object.entries(args)) {
    prompt = prompt.replaceAll(`{{${key}}}`, String(value));
  }
  prompt = prompt.replaceAll('{{vault_context}}', vaultContext);

  try {
    const output = await llmChat([
      { role: 'user', content: prompt },
    ]);
    return { toolCallId, name: def.name, output };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { toolCallId, name: def.name, output: `Tool execution failed: ${msg}` };
  }
}

// ── Tool builder helper ────────────────────────────────────────────────────

/**
 * Generate a .tool.md file content string from structured data.
 * Used by the tool_builder mode to write tool files to the vault.
 */
export function buildToolMdContent(
  name: string,
  description: string,
  parameters: ToolParameterDef[],
  promptTemplate: string,
  outputPath?: string,
): string {
  const paramLines = parameters
    .map(
      p =>
        `  - name: ${p.name}\n    description: ${p.description}\n    required: ${p.required !== false}`,
    )
    .join('\n');

  const fm = [
    `name: ${name}`,
    `description: ${description}`,
    parameters.length > 0 ? `parameters:\n${paramLines}` : 'parameters: []',
    outputPath ? `output_path: ${outputPath}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `---\n${fm}\n---\n\n${promptTemplate}\n`;
}
