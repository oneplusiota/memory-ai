import type { ConversationMessage } from '@/types';
import { buildSystemPrompt } from './ConversationPrompt';
import { llmChat } from '@/services/llm/LLMClient';
import type { LLMMessage } from '@/services/llm/LLMClient';

/** Plain chat with no tools (used when no vault is connected). */
export async function chat(history: ConversationMessage[]): Promise<string> {
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(false) },
    ...history.map((m) => ({ role: m.role, content: m.text })),
  ];
  return llmChat(messages);
}
