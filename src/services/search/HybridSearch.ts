import type { NoteNode, SearchResult } from '@/types';
import { cosineSimilarity } from '@/services/search/GloveService';

// ── Keyword scoring ────────────────────────────────────────────────────────

function keywordScore(note: NoteNode, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;

  const titleLower   = note.title.toLowerCase();
  const tagsLower    = note.tags.map(t => t.toLowerCase());
  const summaryLower = (note.semanticSummary ?? note.summary).toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (titleLower.includes(term))                   score += 3;
    if (tagsLower.some(t => t.includes(term)))       score += 2;
    if (summaryLower.includes(term))                 score += 1;
  }
  return score;
}

// ── Combined search ────────────────────────────────────────────────────────

/**
 * Search notes by keyword + optional semantic (GloVe cosine) scoring.
 *
 * @param notes          - All notes from VaultDB.getAllNotes()
 * @param query          - Raw user query string
 * @param topK           - Max results to return (default 5)
 * @param queryEmbedding - Optional L2-normalised query vector from GloveService.embed()
 *                         When provided: final score = 0.5 * cosine + 0.5 * norm_keyword
 *                         When absent:   final score = keyword score only
 */
export function searchNotes(
  notes: NoteNode[],
  query: string,
  topK: number = 5,
  queryEmbedding?: Float32Array | null,
): SearchResult[] {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);

  const useSemantics = !!queryEmbedding;

  // Compute raw keyword scores to normalise later
  const rawScores = notes.map(note => ({
    note,
    kw: keywordScore(note, queryTerms),
  }));

  if (!useSemantics) {
    return rawScores
      .filter(r => r.kw > 0)
      .sort((a, b) => b.kw - a.kw)
      .slice(0, topK)
      .map(r => ({ note: r.note, score: r.kw }));
  }

  // Normalise keyword scores to [0, 1]
  const maxKw = Math.max(...rawScores.map(r => r.kw), 1);

  const blended = rawScores.map(({ note, kw }) => {
    const normKw = kw / maxKw;
    let cosine = 0;
    if (note.embedding && note.embedding.length > 0) {
      cosine = Math.max(0, cosineSimilarity(queryEmbedding!, note.embedding));
    }
    // Blend: 50% semantic, 50% keyword. Notes without embeddings score on keywords only.
    const score = note.embedding ? 0.5 * cosine + 0.5 * normKw : 0.3 * normKw;
    return { note, score };
  });

  return blended
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Backwards-compatible alias */
export function hybridSearch(
  notes: NoteNode[],
  query: string,
  _unused?: unknown,
  topK: number = 5,
): SearchResult[] {
  return searchNotes(notes, query, topK);
}
