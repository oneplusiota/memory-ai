/**
 * AgentClient — agentic tool-use loop.
 *
 * Sends messages + tool definitions to the LLM. If the model returns tool
 * calls, executes them via ToolExecutor and loops. Stops when the model
 * returns a text reply or the max iteration limit is reached.
 *
 * Write tools (create_note, update_note, create_event) pause the loop and
 * surface a confirmation request to the caller via onConfirmRequired.
 */

import type { AgentMode, ConversationMessage, ToolDefinition, ToolResult } from '@/types';
import type { LLMMessage } from '@/services/llm/LLMClient';
import { llmChatWithTools } from '@/services/llm/LLMClient';
import { executeTool } from './ToolExecutor';
import { executePendingWrite } from './BuiltinTools';

export type ToolStepEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string };

export type AgentCallbacks = {
  /** Called for each tool call/result so UI can show progress */
  onStep?: (event: ToolStepEvent) => void;
  /**
   * Called when a write tool needs confirmation.
   * Resolver should return true to proceed or false to skip.
   */
  onConfirmRequired?: (
    toolName: string,
    path: string,
    content: string,
  ) => Promise<boolean>;
};

const MAX_ITERATIONS = 6;

export async function agentChat(
  history: ConversationMessage[],
  userMessage: string,
  systemPrompt: string,
  tools: ToolDefinition[],
  vaultUri: string,
  customTools: ToolDefinition[],
  mode: AgentMode,
  callbacks: AgentCallbacks = {},
): Promise<string> {
  const { onStep, onConfirmRequired } = callbacks;

  // Build initial messages from conversation history
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    })),
    { role: 'user', content: userMessage },
  ];

  let pendingToolResults: ToolResult[] = [];
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await llmChatWithTools(messages, tools);

    if (response.type === 'text') {
      return response.text;
    }

    // Model wants to call tools
    if (mode === 'single' && iterations > 1) {
      // In single-call mode, stop after first round
      return 'Tool results gathered. Please ask a follow-up question to continue.';
    }

    pendingToolResults = [];

    for (const toolCall of response.toolCalls) {
      onStep?.({ type: 'tool_call', name: toolCall.name, args: toolCall.args });

      const result = await executeTool(toolCall, vaultUri, customTools);

      // Handle write confirmation
      if (result.needsConfirmation && result.pendingWrite) {
        const confirmed = onConfirmRequired
          ? await onConfirmRequired(result.name, result.pendingWrite.path, result.pendingWrite.content)
          : false;

        if (confirmed) {
          await executePendingWrite(vaultUri, result.pendingWrite);
          result.output = `Successfully wrote to "${result.pendingWrite.path}".`;
        } else {
          result.output = `Write to "${result.pendingWrite.path}" was cancelled by user.`;
        }
        // Clear pending write so it's not re-attempted
        result.pendingWrite = undefined;
        result.needsConfirmation = false;
      }

      onStep?.({ type: 'tool_result', name: result.name, output: result.output });
      pendingToolResults.push(result);
    }

    // Append assistant tool-call turn AND the tool-result user turn.
    // Both must be in message history so all providers see a valid
    // tool_use → tool_result sequence in every subsequent iteration.
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: response.toolCalls,
    });
    messages.push({
      role: 'user',
      content: '',
      toolResults: pendingToolResults,
    });
  }

  return 'Reached maximum tool call iterations. Please try rephrasing your request.';
}
