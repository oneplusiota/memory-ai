import { llmChat } from './LLMClient';
import type { LLMMessage } from './LLMClient';
import {
  LIFE_CONTEXT_SYSTEM_PROMPT,
  LIFE_CONTEXT_RESPONSE_SCHEMA,
  LIFE_CONTEXT_SCHEMA_DESCRIPTION,
  LIFE_CONTEXT_INITIAL_TEMPLATE,
  buildLifeContextUpdatePrompt,
} from './LifeContextPrompt';
import { readLifeContext, writeLifeContext } from '@/services/vault/VaultWriter';
import type { ConversationMessage } from '@/types';

export async function refreshLifeContext(
  vaultUri: string,
  messages: ConversationMessage[],
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Only process user messages — AI replies contain no personal info
  const userText = messages
    .filter(m => m.role === 'user')
    .map(m => m.text)
    .join('\n');
  if (!userText.trim()) return null;

  const existingContext = await readLifeContext(vaultUri);
  const current = existingContext ?? LIFE_CONTEXT_INITIAL_TEMPLATE(today);
  const prompt = buildLifeContextUpdatePrompt(userText, current, today);

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: LIFE_CONTEXT_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const text = await llmChat(llmMessages, LIFE_CONTEXT_RESPONSE_SCHEMA, LIFE_CONTEXT_SCHEMA_DESCRIPTION);
  const result = JSON.parse(text) as { updated_context: string; changed: boolean };

  // Always write on first run (no existing file) so the file gets created even
  // if the LLM returns changed: false for a non-personal conversation.
  if (result.updated_context && (result.changed || existingContext === null)) {
    await writeLifeContext(vaultUri, result.updated_context);
    return result.updated_context;
  }
  return null;
}
