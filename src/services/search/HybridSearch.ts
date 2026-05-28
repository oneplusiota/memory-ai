import type { VaultIndex, SearchResult } from '@/types';
import { tokenize, searchTFIDF } from '@/services/indexer/TFIDFIndexer';
import { hopDistance } from '@/services/indexer/GraphIndexer';

export function hybridSearch(
  index: VaultIndex,
  query: string,
  recentNoteId?: string,
  topK: number = 5,
): SearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const tfidfResults = searchTFIDF(index, tokens, topK * 3);

  if (!recentNoteId) {
    return tfidfResults.slice(0, topK);
  }

  // blend TF-IDF with graph proximity to the most recently written note
  const scored = tfidfResults.map(({ note, score: tfidfScore }) => {
    const hops = hopDistance(index, recentNoteId, note.id);
    const graphScore = hops === Infinity ? 0 : 1 / (hops + 1);
    return { note, score: 0.7 * tfidfScore + 0.3 * graphScore };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
