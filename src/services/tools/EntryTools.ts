/**
 * Tools the assistant can call. They are read-only: entries are created by
 * capturing (mic or keyboard), never by the model.
 */

import type { ToolCall, ToolDefinition, ToolResult } from '@/types';
import { listEntries, searchEntries } from '@/services/db/EntryDB';
import type { Entry } from '@/services/db/EntryDB';
import { formatLocalDate, formatLocalTime } from '@/utils/dateUtils';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_entries',
    description: "Full-text search over the user's captured entries (stemming and prefix matching, best matches first). Use short keyword queries.",
    parameters: [
      { name: 'query', description: 'Keywords to search for, e.g. "knee running"', type: 'string', required: true },
      { name: 'limit', description: 'Maximum number of results (default 8)', type: 'number', required: false },
    ],
  },
  {
    name: 'recent_entries',
    description: "List the user's most recent entries, newest first. Use for questions about today, yesterday or this week.",
    parameters: [
      { name: 'limit', description: 'Maximum number of entries (default 10)', type: 'number', required: false },
    ],
  },
  {
    name: 'get_date_time',
    description: 'Get the current date and time.',
    parameters: [],
  },
];

function formatEntries(entries: Entry[]): string {
  return entries
    .map((e) => {
      const d = new Date(e.createdAt);
      const text = e.text.length > 600 ? `${e.text.slice(0, 600)}…` : e.text;
      return `[${formatLocalDate(d)} ${formatLocalTime(d)}] ${text}`;
    })
    .join('\n\n');
}

function clampLimit(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 25) : fallback;
}

export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const { id, name, args } = call;
  try {
    switch (name) {
      case 'search_entries': {
        const query = String(args.query ?? '').trim();
        if (!query) return { toolCallId: id, name, output: 'Error: query is required.' };
        const results = await searchEntries(query, clampLimit(args.limit, 8));
        return {
          toolCallId: id,
          name,
          output: results.length ? `Found ${results.length} entries:\n\n${formatEntries(results)}` : 'No entries matched that query.',
        };
      }
      case 'recent_entries': {
        const results = await listEntries(clampLimit(args.limit, 10));
        return {
          toolCallId: id,
          name,
          output: results.length ? formatEntries(results) : 'There are no entries yet.',
        };
      }
      case 'get_date_time': {
        const now = new Date();
        return { toolCallId: id, name, output: `Current date: ${formatLocalDate(now)}, time: ${formatLocalTime(now)}` };
      }
      default:
        return { toolCallId: id, name, output: `Error: unknown tool "${name}".` };
    }
  } catch (e) {
    // Report tool failures to the model instead of aborting the whole conversation
    return { toolCallId: id, name, output: `Error running ${name}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
