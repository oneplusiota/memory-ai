import type { LLMProvider, ToolCall, ToolDefinition, ToolResult } from '@/types';

export type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LLMResponse =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; toolCalls: ToolCall[] };

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
let groqModel = 'llama-3.3-70b-versatile';

export function setActiveProvider(p: LLMProvider) { activeProvider = p; }
export function getActiveProvider(): LLMProvider { return activeProvider; }
export function setGeminiKey(k: string) { geminiKey = k; }
export function setGeminiModel(m: string) { geminiModel = m; }
export function setGroqKey(k: string) { groqKey = k; }
export function setGroqModel(m: string) { groqModel = m; }

// ── Unified chat call ──────────────────────────────────────────────────────

/**
 * Standard JSON-mode chat (existing callers unchanged).
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

/**
 * Tool-aware chat. Returns either a text reply or a list of tool calls.
 * When tool calls are returned, the caller should execute them and call this
 * again with the results appended as tool result messages.
 *
 * @param messages    Conversation including any prior tool result turns
 * @param tools       Tool definitions available to the model
 * @param toolResults Results from the previous tool call round (optional)
 */
export async function llmChatWithTools(
  messages: LLMMessage[],
  tools: ToolDefinition[],
  toolResults?: ToolResult[],
): Promise<LLMResponse> {
  if (activeProvider === 'groq') {
    return callGroqWithTools(messages, tools, toolResults);
  }
  return callGeminiWithTools(messages, tools, toolResults);
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
    model: groqModel,
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

// ── Gemini tool-calling adapter ────────────────────────────────────────────

function toGeminiTool(tool: ToolDefinition): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = {
      type: (p.type ?? 'string').toUpperCase(),
      description: p.description,
    };
    if (p.required !== false) required.push(p.name);
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: { type: 'OBJECT', properties, required },
  };
}

async function callGeminiWithTools(
  messages: LLMMessage[],
  tools: ToolDefinition[],
  toolResults?: ToolResult[],
): Promise<LLMResponse> {
  if (!geminiKey) throw new LLMAuthError('Gemini');

  const systemMsg = messages.find(m => m.role === 'system');
  const turns = messages.filter(m => m.role !== 'system');

  // Build contents array; append tool result turns if present
  const contents: object[] = turns.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  if (toolResults && toolResults.length > 0) {
    contents.push({
      role: 'user',
      parts: toolResults.map(r => ({
        functionResponse: { name: r.name, response: { content: r.output } },
      })),
    });
  }

  const body: Record<string, unknown> = {
    contents,
    tools: [{ function_declarations: tools.map(toGeminiTool) }],
  };

  if (systemMsg) {
    body.system_instruction = { parts: [{ text: systemMsg.content }] };
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
  const parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] =
    data.candidates?.[0]?.content?.parts ?? [];

  const fnCalls = parts.filter(p => p.functionCall);
  if (fnCalls.length > 0) {
    return {
      type: 'tool_calls',
      toolCalls: fnCalls.map((p, i) => ({
        id: `gemini-tc-${Date.now()}-${i}`,
        name: p.functionCall!.name,
        args: p.functionCall!.args ?? {},
      })),
    };
  }

  return { type: 'text', text: parts.find(p => p.text)?.text ?? '' };
}

// ── Groq tool-calling adapter (OpenAI-compatible) ─────────────────────────

function toGroqTool(tool: ToolDefinition): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: p.type ?? 'string', description: p.description };
    if (p.required !== false) required.push(p.name);
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { type: 'object', properties, required },
    },
  };
}

async function callGroqWithTools(
  messages: LLMMessage[],
  tools: ToolDefinition[],
  toolResults?: ToolResult[],
): Promise<LLMResponse> {
  if (!groqKey) throw new LLMAuthError('Groq');

  const finalMessages: object[] = [...messages];
  if (toolResults && toolResults.length > 0) {
    for (const r of toolResults) {
      finalMessages.push({ role: 'tool', tool_call_id: r.toolCallId, content: r.output });
    }
  }

  const body = {
    model: groqModel,
    messages: finalMessages,
    tools: tools.map(toGroqTool),
    tool_choice: 'auto',
    temperature: 0.2,
  };

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 429) throw new LLMQuotaError('Groq');
    if (response.status === 401 || response.status === 403) throw new LLMAuthError('Groq');
    throw new Error(`Groq ${response.status}: ${err}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const msg = choice?.message;

  if (msg?.tool_calls && msg.tool_calls.length > 0) {
    return {
      type: 'tool_calls',
      toolCalls: msg.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments ?? '{}'),
      })),
    };
  }

  return { type: 'text', text: msg?.content ?? '' };
}
