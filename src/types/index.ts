export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

export type LLMProvider = 'gemini' | 'groq' | 'claude' | 'openrouter';

// ── Tool system ────────────────────────────────────────────────────────────

export type ToolParameterDef = {
  name: string;
  description: string;
  type?: 'string' | 'number' | 'boolean';
  required?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterDef[];
};

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ToolResult = {
  toolCallId: string;
  name: string;
  output: string;
};
