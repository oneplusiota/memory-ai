import type { ConversationMessage, ConversationMode, ConversationResponse, NoteNode, RoutingDecision } from '@/types';
import {
  buildSystemPrompt,
  CONVERSATION_RESPONSE_SCHEMA,
  buildChatPrompt,
  buildSavePrompt,
} from './ConversationPrompt';
import { ROUTING_RESPONSE_SCHEMA } from './RoutingSchema';
import { SYSTEM_PROMPT as SAVE_SYSTEM_PROMPT } from './RoutingPrompt';
import { llmChat } from '@/services/llm/LLMClient';
import type { LLMMessage } from '@/services/llm/LLMClient';
import { sanitizeDates, getTodayDateString, getTimeHeading } from '@/utils/dateUtils';

const CONVERSATION_SCHEMA_DESCRIPTION = `{
  "reply": "string — your response to the user",
  "intent": "answer" | "acknowledge" | "clarify",
  "suggest_save": true | false
}`;

const ROUTING_SCHEMA_DESCRIPTION = `{
  "notes": [
    {
      "action": "create_atom" | "update_atom",
      "path": "string — vault-relative path like atoms/Note-Name.md",
      "content": "string — full markdown content to write/append"
    }
  ],
  "daily_entry": "string — short timestamped block for today's daily note (always required)",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string — brief explanation"
}`;

export async function chat(
  history: ConversationMessage[],
  relevantNotes: NoteNode[],
  currentMessage: string,
  allAtoms: NoteNode[],
  lifeContext?: string,
  mode: ConversationMode = 'journal',
): Promise<ConversationResponse> {
  const userPrompt = buildChatPrompt(history, relevantNotes, currentMessage, allAtoms, lifeContext);
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt(mode) },
    { role: 'user', content: userPrompt },
  ];
  const text = await llmChat(messages, CONVERSATION_RESPONSE_SCHEMA, CONVERSATION_SCHEMA_DESCRIPTION);
  return JSON.parse(text) as ConversationResponse;
}

export async function saveConversation(
  history: ConversationMessage[],
  allAtoms: NoteNode[],
): Promise<RoutingDecision> {
  const today = getTodayDateString();
  const time = getTimeHeading();
  const userPrompt = buildSavePrompt(history, allAtoms, today, time);
  const messages: LLMMessage[] = [
    { role: 'system', content: SAVE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
  const text = await llmChat(messages, ROUTING_RESPONSE_SCHEMA, ROUTING_SCHEMA_DESCRIPTION);
  const decision = JSON.parse(text) as RoutingDecision;

  // Sanitize dates: replace any hallucinated years with the correct one
  const correctYear = today.slice(0, 4);
  return {
    ...decision,
    daily_entry: sanitizeDates(decision.daily_entry, correctYear),
    notes: decision.notes.map((n) => ({
      ...n,
      content: sanitizeDates(n.content, correctYear),
    })),
  };
}
