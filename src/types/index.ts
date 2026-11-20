export type NoteNode = {
  id: string;
  title: string;
  tags: string[];
  aliases: string[];
  summary: string;
  outlinks: string[];
  lastModified: number;
  // Zettelkasten / Dataview fields (optional, only set on atom notes)
  type?: string;    // person | project | concept | decision | area | tool | daily
  area?: string;    // work | personal | health | finance | learning | other
  status?: string;  // active | dormant | archived
};

export type SearchResult = {
  note: NoteNode;
  score: number;
};

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
  /** If true, user must confirm before result is written to vault */
  needsConfirmation?: boolean;
  /** The pending write op to execute after confirmation */
  pendingWrite?: { path: string; content: string; action: 'create' | 'update' };
};
