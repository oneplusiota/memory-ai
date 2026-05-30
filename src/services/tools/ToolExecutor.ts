/**
 * ToolExecutor — dispatches tool calls to the right implementation.
 * Handles: built-in tools, web search, calendar, and custom .tool.md tools.
 */

import type { ToolCall, ToolDefinition, ToolResult } from '@/types';
import { executeBuiltinTool } from './BuiltinTools';
import { executeWebSearch } from './WebSearchClient';
import { executeCalendarTool } from './CalendarClient';
import { executeCustomTool } from './ToolRegistry';

const BUILTIN_NAMES = new Set([
  'search_vault',
  'read_note',
  'list_notes',
  'create_note',
  'update_note',
  'get_date_time',
]);

const WEB_SEARCH_NAMES = new Set(['web_search']);

const CALENDAR_NAMES = new Set(['list_events', 'create_event']);

export async function executeTool(
  toolCall: ToolCall,
  vaultUri: string,
  customTools: ToolDefinition[],
): Promise<ToolResult> {
  const { id, name, args } = toolCall;

  if (BUILTIN_NAMES.has(name)) {
    return executeBuiltinTool(id, name, args, vaultUri);
  }

  if (WEB_SEARCH_NAMES.has(name)) {
    return executeWebSearch(id, args);
  }

  if (CALENDAR_NAMES.has(name)) {
    return executeCalendarTool(id, name, args);
  }

  // Custom tool from .tool.md
  const customDef = customTools.find(t => t.name === name);
  if (customDef) {
    return executeCustomTool(id, customDef, args, vaultUri);
  }

  return { toolCallId: id, name, output: `Error: unknown tool "${name}".` };
}
