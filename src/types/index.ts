export type NoteNode = {
  id: string;
  title: string;
  tags: string[];
  aliases: string[];
  summary: string;
  outlinks: string[];
  lastModified: number;
  // Zettelkasten / Dataview fields (optional, only set on atom notes)
  type?: string;    // person | project | concept | decision | area | tool | daily | conversation
  area?: string;    // work | personal | health | finance | learning | other
  status?: string;  // active | dormant | archived
};

export type NoteWriteOp = {
  action: 'create_atom' | 'update_atom';
  path: string;
  content: string;
};

export type RoutingDecision = {
  notes: NoteWriteOp[];
  daily_entry: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
};

export type SearchResult = {
  note: NoteNode;
  score: number;
};

export type VaultIndex = {
  notes: Record<string, NoteNode>;
  tfidf: Record<string, Record<string, number>>;
  corpusStats: Record<string, number>;
  links: Record<string, string[]>;
  builtAt: number;
};

export type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

export type ConversationResponse = {
  reply: string;
  suggest_save: boolean;
};

export type STTMode = 'native' | 'gemini-audio' | 'native-corrected';

export type LLMProvider = 'gemini' | 'groq' | 'claude';

export type ConversationMode = 'journal' | 'coach' | 'analyst' | 'devil' | 'tool_builder';

export type AgentMode = 'agentic' | 'single';

export type WebSearchProvider = 'tavily' | 'google';

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
  /** 'builtin' = implemented in code; 'custom' = .tool.md prompt-based */
  kind: 'builtin' | 'custom';
  /** For custom tools: vault-relative path to the .tool.md file */
  sourcePath?: string;
  /** For custom tools: parsed prompt template body */
  promptTemplate?: string;
  /** Optional default output path in vault (custom tools only) */
  outputPath?: string;
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
