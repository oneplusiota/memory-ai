/**
 * ToolExecutor — dispatches tool calls to their implementations.
 */

import type { ToolCall, ToolResult } from '@/types';
import { executeBuiltinTool } from './BuiltinTools';

export async function executeTool(toolCall: ToolCall, vaultUri: string): Promise<ToolResult> {
  const { id, name, args } = toolCall;
  try {
    return await executeBuiltinTool(id, name, args, vaultUri);
  } catch (e) {
    // Report tool failures to the model instead of aborting the whole conversation
    const message = e instanceof Error ? e.message : String(e);
    return { toolCallId: id, name, output: `Error running ${name}: ${message}` };
  }
}
