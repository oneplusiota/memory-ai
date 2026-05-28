import type { VaultIndex, NoteNode, SearchResult } from '@/types';

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'not','no','nor','so','yet','both','either','neither','each','few','more',
  'most','other','some','such','than','that','these','this','those','very',
  'just','into','about','also','as','it','its','i','me','my','we','us','our',
  'you','your','he','she','they','them','their','what','which','who','how',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export function indexNote(index: VaultIndex, noteId: string, tokens: string[]): void {
  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;

  const prev = index.tfidf[noteId] ?? {};
  // update corpusStats: remove old, add new
  for (const t of Object.keys(prev)) {
    if (!(t in freq)) {
      index.corpusStats[t] = Math.max(0, (index.corpusStats[t] ?? 1) - 1);
    }
  }
  for (const t of Object.keys(freq)) {
    if (!(t in prev)) {
      index.corpusStats[t] = (index.corpusStats[t] ?? 0) + 1;
    }
  }

  const total = tokens.length || 1;
  const tfidfScores: Record<string, number> = {};
  const N = Math.max(Object.keys(index.notes).length, 1);
  for (const [t, count] of Object.entries(freq)) {
    const tf = count / total;
    const df = index.corpusStats[t] ?? 1;
    const idf = Math.log((N + 1) / (df + 1)) + 1;
    tfidfScores[t] = tf * idf;
  }
  index.tfidf[noteId] = tfidfScores;
}

export function searchTFIDF(
  index: VaultIndex,
  queryTokens: string[],
  topK: number = 5,
): SearchResult[] {
  const scores: Map<string, number> = new Map();
  const N = Math.max(Object.keys(index.notes).length, 1);

  for (const token of queryTokens) {
    const df = index.corpusStats[token] ?? 0;
    if (df === 0) continue;
    const idf = Math.log((N + 1) / (df + 1)) + 1;
    for (const [noteId, tfidfMap] of Object.entries(index.tfidf)) {
      const score = (tfidfMap[token] ?? 0) * idf;
      if (score > 0) scores.set(noteId, (scores.get(noteId) ?? 0) + score);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([noteId, score]) => ({ note: index.notes[noteId], score }))
    .filter((r) => r.note != null);
}
