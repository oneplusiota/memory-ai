import type { LLMProvider } from '@/types';

export type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class LLMQuotaError extends Error {
  constructor(provider: string) {
    super(`${provider} daily quota exceeded. Switch providers in Settings or try again tomorrow.`);
    this.name = 'LLMQuotaError';
  }
}

export class LLMAuthError extends Error {
  constructor(provider: string) {
    super(`${provider} API key is invalid. Check your key in Settings.`);
    this.name = 'LLMAuthError';
  }
}

// ── Module-level state ─────────────────────────────────────────────────────
let activeProvider: LLMProvider = 'gemini';
let geminiKey = '';
let geminiModel = 'gemini-2.0-flash';
let groqKey = '';

export function setActiveProvider(p: LLMProvider) { activeProvider = p; }
export function getActiveProvider(): LLMProvider { return activeProvider; }
export function setGeminiKey(k: string) { geminiKey = k; }
export function setGeminiModel(m: string) { geminiModel = m; }
export function setGroqKey(k: string) { groqKey = k; }

// ── Unified chat call ──────────────────────────────────────────────────────

/**
 * @param messages   Conversation in OpenAI format (system/user/assistant)
 * @param jsonSchema Gemini schema object (used when provider = gemini)
 * @param jsonSchemaDescription Plain-text schema description appended to system prompt (used when provider = groq)
 */
export async function llmChat(
  messages: LLMMessage[],
  jsonSchema?: object,
  jsonSchemaDescription?: string,
): Promise<string> {
  if (activeProvider === 'groq') {
    return callGroq(messages, jsonSchema ? jsonSchemaDescription : undefined);
  }
  return callGemini(messages, jsonSchema);
}

// ── Gemini adapter ─────────────────────────────────────────────────────────

async function callGemini(messages: LLMMessage[], jsonSchema?: object): Promise<string> {
  if (!geminiKey) throw new LLMAuthError('Gemini');

  const systemMsg = messages.find(m => m.role === 'system');
  const turns = messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    contents: turns.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  };

  if (systemMsg) {
    body.system_instruction = { parts: [{ text: systemMsg.content }] };
  }

  if (jsonSchema) {
    body.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: jsonSchema,
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) throw new LLMQuotaError('Gemini');
    if (response.status === 401 || response.status === 403) throw new LLMAuthError('Gemini');
    throw new Error(`Gemini ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Groq adapter (OpenAI-compatible) ──────────────────────────────────────

async function callGroq(messages: LLMMessage[], jsonSchemaDescription?: string): Promise<string> {
  if (!groqKey) throw new LLMAuthError('Groq');

  // Inject schema description into system prompt so Llama follows the structure
  const finalMessages = jsonSchemaDescription
    ? messages.map(m =>
        m.role === 'system'
          ? { ...m, content: `${m.content}\n\nYou MUST respond with valid JSON matching this schema:\n${jsonSchemaDescription}` }
          : m,
      )
    : messages;

  const body: Record<string, unknown> = {
    model: 'llama-3.3-70b-versatile',
    messages: finalMessages,
    temperature: 0.2,
  };

  if (jsonSchemaDescription) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) throw new LLMQuotaError('Groq');
    if (response.status === 401 || response.status === 403) throw new LLMAuthError('Groq');
    throw new Error(`Groq ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
