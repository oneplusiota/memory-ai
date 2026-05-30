import type { LLMProvider, ToolCall, ToolDefinition, ToolResult } from "@/types";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  /** Populated when this assistant turn represents tool calls (for multi-turn history) */
  toolCalls?: ToolCall[];
  /** Populated when this user turn carries tool results (for multi-turn history) */
  toolResults?: ToolResult[];
};

export type LLMResponse =
  | { type: "text"; text: string }
  | { type: "tool_calls"; toolCalls: ToolCall[] };

export class LLMQuotaError extends Error {
  constructor(provider: string) {
    super(`${provider} daily quota exceeded. Switch providers in Settings or try again tomorrow.`);
    this.name = "LLMQuotaError";
  }
}

export class LLMAuthError extends Error {
  constructor(provider: string) {
    super(`${provider} API key is invalid. Check your key in Settings.`);
    this.name = "LLMAuthError";
  }
}

export class LLMModelAccessError extends Error {
  constructor(provider: string, model: string) {
    super(`Your ${provider} plan does not include access to ${model}. Upgrade your account or choose a different model in Settings.`);
    this.name = "LLMModelAccessError";
  }
}

// ── Shared error helper ────────────────────────────────────────────────────

/** Parses a non-ok API response and throws the most specific error type. Never returns. */
function throwOnApiError(status: number, rawBody: string, provider: string, model: string): never {
  if (status === 429) throw new LLMQuotaError(provider);
  if (status === 401) throw new LLMAuthError(provider);

  if (status === 403) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(rawBody); } catch { /* ignore */ }

    if (isModelAccessDenied(parsed, provider)) {
      throw new LLMModelAccessError(provider, model);
    }
    throw new LLMAuthError(provider);
  }

  throw new Error(`${provider} ${status}: ${rawBody}`);
}

function isModelAccessDenied(parsed: Record<string, unknown>, provider: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parsed as any;
  if (provider === "Claude") {
    return p?.error?.type === "permission_error";
  }
  if (provider === "Gemini") {
    const msg: string = (p?.error?.message ?? "").toLowerCase();
    return p?.error?.status === "PERMISSION_DENIED" && (msg.includes("model") || msg.includes("not found"));
  }
  if (provider === "Groq") {
    const msg: string = (p?.error?.message ?? "").toLowerCase();
    return msg.includes("model") && (msg.includes("not found") || msg.includes("not available") || msg.includes("permission"));
  }
  return false;
}

// ── Adapter interface ──────────────────────────────────────────────────────

export interface LLMAdapter {
  chat(
    messages: LLMMessage[],
    jsonSchema?: object,
    jsonSchemaDescription?: string,
  ): Promise<string>;

  chatWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse>;
}

// ── Factory ────────────────────────────────────────────────────────────────

export class LLMAdapterFactory {
  private static readonly registry = new Map<LLMProvider, LLMAdapter>();

  static register(provider: LLMProvider, adapter: LLMAdapter): void {
    this.registry.set(provider, adapter);
  }

  static get(provider: LLMProvider): LLMAdapter {
    const adapter = this.registry.get(provider);
    if (!adapter) throw new Error(`No LLM adapter registered for provider: ${provider}`);
    return adapter;
  }
}

// ── Module-level state ─────────────────────────────────────────────────────

let activeProvider: LLMProvider = "gemini";
let geminiKey = "";
let geminiModel = "gemini-2.0-flash";
let groqKey = "";
let groqModel = "llama-3.3-70b-versatile";
let claudeKey = "";
let claudeModel = "claude-sonnet-4-6";

export function setActiveProvider(p: LLMProvider) { activeProvider = p; }
export function getActiveProvider(): LLMProvider { return activeProvider; }
export function setGeminiKey(k: string) { geminiKey = k; }
export function getGeminiKey(): string { return geminiKey; }
export function setGeminiModel(m: string) { geminiModel = m; }
export function setGroqKey(k: string) { groqKey = k; }
export function setGroqModel(m: string) { groqModel = m; }
export function setClaudeKey(k: string) { claudeKey = k; }
export function setClaudeModel(m: string) { claudeModel = m; }

// ── Public facade ──────────────────────────────────────────────────────────

export async function llmChat(
  messages: LLMMessage[],
  jsonSchema?: object,
  jsonSchemaDescription?: string,
): Promise<string> {
  return LLMAdapterFactory.get(activeProvider).chat(messages, jsonSchema, jsonSchemaDescription);
}

export async function llmChatWithTools(
  messages: LLMMessage[],
  tools: ToolDefinition[],
): Promise<LLMResponse> {
  return LLMAdapterFactory.get(activeProvider).chatWithTools(messages, tools);
}

// ── Gemini adapter ─────────────────────────────────────────────────────────

function toGeminiTool(tool: ToolDefinition): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = {
      type: (p.type ?? "string").toUpperCase(),
      description: p.description,
    };
    if (p.required !== false) required.push(p.name);
  }
  return {
    name: tool.name,
    description: tool.description,
    parameters: { type: "OBJECT", properties, required },
  };
}

class GeminiAdapter implements LLMAdapter {
  async chat(messages: LLMMessage[], jsonSchema?: object): Promise<string> {
    if (!geminiKey) throw new LLMAuthError("Gemini");

    const systemMsg = messages.find(m => m.role === "system");
    const turns = messages.filter(m => m.role !== "system");

    const body: Record<string, unknown> = {
      contents: turns.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    };

    if (systemMsg) {
      body.system_instruction = { parts: [{ text: systemMsg.content }] };
    }

    if (jsonSchema) {
      body.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: jsonSchema,
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Gemini", geminiModel);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    if (!geminiKey) throw new LLMAuthError("Gemini");

    const systemMsg = messages.find(m => m.role === "system");
    const turns = messages.filter(m => m.role !== "system");

    const contents: object[] = turns.map(m => {
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "model",
          parts: m.toolCalls.map(tc => ({ functionCall: { name: tc.name, args: tc.args } })),
        };
      }
      if (m.toolResults && m.toolResults.length > 0) {
        return {
          role: "user",
          parts: m.toolResults.map(r => ({
            functionResponse: { name: r.name, response: { content: r.output } },
          })),
        };
      }
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      };
    });

    const body: Record<string, unknown> = {
      contents,
      tools: [{ function_declarations: tools.map(toGeminiTool) }],
    };

    if (systemMsg) {
      body.system_instruction = { parts: [{ text: systemMsg.content }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Gemini", geminiModel);
    }

    const data = await response.json();
    const parts: { text?: string; functionCall?: { name: string; args: Record<string, unknown> } }[] =
      data.candidates?.[0]?.content?.parts ?? [];

    const fnCalls = parts.filter(p => p.functionCall);
    if (fnCalls.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: fnCalls.map((p, i) => ({
          id: `gemini-tc-${Date.now()}-${i}`,
          name: p.functionCall!.name,
          args: p.functionCall!.args ?? {},
        })),
      };
    }

    return { type: "text", text: parts.find(p => p.text)?.text ?? "" };
  }
}

// ── Groq adapter (OpenAI-compatible) ──────────────────────────────────────

function toOpenAITool(tool: ToolDefinition): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: p.type ?? "string", description: p.description };
    if (p.required !== false) required.push(p.name);
  }
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { type: "object", properties, required },
    },
  };
}

class GroqAdapter implements LLMAdapter {
  async chat(messages: LLMMessage[], _jsonSchema?: object, jsonSchemaDescription?: string): Promise<string> {
    if (!groqKey) throw new LLMAuthError("Groq");

    const finalMessages = jsonSchemaDescription
      ? messages.map(m =>
          m.role === "system"
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
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Groq", groqModel);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    if (!groqKey) throw new LLMAuthError("Groq");

    // Llama models sometimes emit tool calls as inline <function=name> text.
    // An explicit system-level instruction suppresses this behaviour.
    const TOOL_DISCIPLINE =
      "\n\nIMPORTANT: You have access to tools. When you need to call a tool you MUST use the structured tool_calls mechanism — never write function calls as raw text in your response. Do NOT output any inline function-call syntax such as <function=name>, <function(name)>, or similar patterns in your message content. All tool invocations must go through the tool_calls API field only.";

    // Groq/OpenAI: tool results are individual messages, so flatten them
    const finalMessages: object[] = [];
    for (const m of messages) {
      if (m.toolCalls && m.toolCalls.length > 0) {
        finalMessages.push({
          role: "assistant",
          content: null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        });
      } else if (m.toolResults && m.toolResults.length > 0) {
        // Each tool result must be its own message in OpenAI format
        for (const r of m.toolResults) {
          finalMessages.push({ role: "tool", tool_call_id: r.toolCallId, content: r.output });
        }
      } else if (m.role === "system") {
        finalMessages.push({ ...m, content: m.content + TOOL_DISCIPLINE });
      } else {
        finalMessages.push(m);
      }
    }

    const body = {
      model: groqModel,
      messages: finalMessages,
      tools: tools.map(toOpenAITool),
      tool_choice: "auto",
      temperature: 0.2,
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Groq", groqModel);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: msg.tool_calls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments ?? "{}"),
        })),
      };
    }

    return { type: "text", text: msg?.content ?? "" };
  }
}

// ── Claude adapter (Anthropic Messages API) ────────────────────────────────

function toClaudeTool(tool: ToolDefinition): object {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: p.type ?? "string", description: p.description };
    if (p.required !== false) required.push(p.name);
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: { type: "object", properties, required },
  };
}

class ClaudeAdapter implements LLMAdapter {
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  private readonly apiVersion = "2023-06-01";

  async chat(
    messages: LLMMessage[],
    _jsonSchema?: object,
    jsonSchemaDescription?: string,
  ): Promise<string> {
    if (!claudeKey) throw new LLMAuthError("Claude");

    const systemMsg = messages.find(m => m.role === "system");
    const turns = messages.filter(m => m.role !== "system");

    let system = systemMsg?.content ?? "";
    if (jsonSchemaDescription) {
      system += `\n\nYou MUST respond with valid JSON matching this schema:\n${jsonSchemaDescription}`;
    }

    const body: Record<string, unknown> = {
      model: claudeModel,
      max_tokens: 4096,
      messages: turns.map(m => ({ role: m.role, content: m.content })),
    };

    if (system) body.system = system;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Claude", claudeModel);
    }

    const data = await response.json();
    const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
    return (textBlock as { text?: string } | undefined)?.text ?? "";
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
  ): Promise<LLMResponse> {
    if (!claudeKey) throw new LLMAuthError("Claude");

    const systemMsg = messages.find(m => m.role === "system");
    const turns = messages.filter(m => m.role !== "system");

    type ClaudeMessage = { role: string; content: unknown };
    const claudeMessages: ClaudeMessage[] = turns.map(m => {
      if (m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: "assistant",
          content: m.toolCalls.map(tc => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          })),
        };
      }
      if (m.toolResults && m.toolResults.length > 0) {
        return {
          role: "user",
          content: m.toolResults.map(r => ({
            type: "tool_result",
            tool_use_id: r.toolCallId,
            content: r.output,
          })),
        };
      }
      return { role: m.role, content: m.content };
    });

    const body: Record<string, unknown> = {
      model: claudeModel,
      max_tokens: 4096,
      messages: claudeMessages,
      tools: tools.map(toClaudeTool),
    };

    if (systemMsg?.content) body.system = systemMsg.content;

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throwOnApiError(response.status, await response.text(), "Claude", claudeModel);
    }

    const data = await response.json();
    const content: { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }[] =
      data.content ?? [];

    const toolUseBlocks = content.filter(b => b.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: toolUseBlocks.map(b => ({
          id: b.id!,
          name: b.name!,
          args: b.input ?? {},
        })),
      };
    }

    const textBlock = content.find(b => b.type === "text");
    return { type: "text", text: textBlock?.text ?? "" };
  }
}

// ── Register all adapters ──────────────────────────────────────────────────

LLMAdapterFactory.register("gemini", new GeminiAdapter());
LLMAdapterFactory.register("groq", new GroqAdapter());
LLMAdapterFactory.register("claude", new ClaudeAdapter());
