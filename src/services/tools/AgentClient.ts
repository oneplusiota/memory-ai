/**
 * AgentClient — tool-use loop.
 *
 * Sends messages + tool definitions to the LLM. If the model returns tool
 * calls, executes them and loops. Stops when the model returns a text reply
 * or the iteration limit is reached.
 */

import type { ConversationMessage, ToolDefinition } from '@/types';
import type { LLMMessage } from '@/services/llm/LLMClient';
import { llmChatWithTools } from '@/services/llm/LLMClient';
import { executeTool } from './EntryTools';

export type ToolStepEvent =
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string };

const MAX_ITERATIONS = 6;

export async function agentChat(
  history: ConversationMessage[],
  userMessage: string,
  systemPrompt: string,
  tools: ToolDefinition[],
  onStep?: (event: ToolStepEvent) => void,
): Promise<string> {
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await llmChatWithTools(messages, tools);
    if (response.type === 'text') return response.text;

    const results = [];
    for (const toolCall of response.toolCalls) {
      onStep?.({ type: 'tool_call', name: toolCall.name, args: toolCall.args });
      const result = await executeTool(toolCall);
      onStep?.({ type: 'tool_result', name: result.name, output: result.output });
      results.push(result);
    }

    // Both turns must be in history so every provider sees a valid tool_use → tool_result sequence
    messages.push({ role: 'assistant', content: '', toolCalls: response.toolCalls });
    messages.push({ role: 'user', content: '', toolResults: results });
  }

  return 'I looked through your entries but could not settle on an answer. Try rephrasing your question.';
}
