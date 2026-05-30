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

export type LLMProvider = 'gemini' | 'groq';

export type ConversationMode = 'journal' | 'coach' | 'analyst' | 'devil';
