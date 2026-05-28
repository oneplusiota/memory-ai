import type { ConversationMessage, ConversationResponse, NoteNode, RoutingDecision, VaultStats } from '@/types';
import {
  CONVERSATION_SYSTEM_PROMPT,
  CONVERSATION_RESPONSE_SCHEMA,
  buildChatPrompt,
  buildSavePrompt,
} from './ConversationPrompt';
import { ROUTING_RESPONSE_SCHEMA } from './RoutingSchema';
import { SYSTEM_PROMPT as SAVE_SYSTEM_PROMPT } from './RoutingPrompt';
import { llmChat } from '@/services/llm/LLMClient';
import type { LLMMessage } from '@/services/llm/LLMClient';

// Plain-text schema descriptions for Groq (which can't enforce schema server-side)
const CONVERSATION_SCHEMA_DESCRIPTION = `{
  "reply": "string — your response to the user",
  "intent": "answer" | "acknowledge" | "clarify",
  "suggest_save": true | false
}`;

const ROUTING_SCHEMA_DESCRIPTION = `{
  "action": "update_atom" | "create_atom" | "log_only" | "link_notes",
  "target_note": "string — vault-relative path like atoms/Name.md (empty if log_only)",
  "atom_content": "string — markdown to write to the atom note (empty if log_only)",
  "daily_entry": "string — short timestamped block for today's daily note (always required)",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string — brief explanation"
}`;

export async function chat(
  history: ConversationMessage[],
  relevantNotes: NoteNode[],
  currentMessage: string,
  vaultStats: VaultStats,
): Promise<ConversationResponse> {
  const userPrompt = buildChatPrompt(history, relevantNotes, currentMessage, vaultStats);
  const messages: LLMMessage[] = [
    { role: 'system', content: CONVERSATION_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const text = await llmChat(messages, CONVERSATION_RESPONSE_SCHEMA, CONVERSATION_SCHEMA_DESCRIPTION);
  return JSON.parse(text) as ConversationResponse;
}

export async function saveConversation(
  history: ConversationMessage[],
): Promise<RoutingDecision> {
  const userPrompt = buildSavePrompt(history);
  const messages: LLMMessage[] = [
    { role: 'system', content: SAVE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const text = await llmChat(messages, ROUTING_RESPONSE_SCHEMA, ROUTING_SCHEMA_DESCRIPTION);
  return JSON.parse(text) as RoutingDecision;
}
