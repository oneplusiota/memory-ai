import type { NoteNode, SearchResult } from '@/types';

function keywordScore(note: NoteNode, queryTerms: string[]): number {
  const titleLower = note.title.toLowerCase();
  const tagsLower = note.tags.map(t => t.toLowerCase());
  const summaryLower = note.summary.toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (titleLower.includes(term)) score += 3;
    if (tagsLower.some(t => t.includes(term))) score += 2;
    if (summaryLower.includes(term)) score += 1;
  }
  return score;
}

/** Keyword search over title, tags and summary. */
export function searchNotes(notes: NoteNode[], query: string, topK: number = 5): SearchResult[] {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
  if (queryTerms.length === 0) return [];

  return notes
    .map(note => ({ note, score: keywordScore(note, queryTerms) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
