export type NoteNode = {
  id: string;
  title: string;
  tags: string[];
  aliases: string[];
  summary: string;
  outlinks: string[];
  lastModified: number;
};

export type RoutingDecision = {
  action: 'append_to_topic' | 'create_topic' | 'create_log_only' | 'link_notes';
  target_note: string;
  content: string;
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

export type AppState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'confirming'
  | 'writing'
  | 'done'
  | 'error';
