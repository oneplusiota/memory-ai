/**
 * textUtils — lightweight text helpers used for both indexing and UI display.
 */

/**
 * Returns the paragraph with the highest ratio of unique words to length,
 * capped at maxChars. Better note description signal than the first N chars.
 */
export function extractDensestParagraph(body: string, maxChars: number = 600): string {
  const paragraphs = body.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 40);
  if (paragraphs.length === 0) return body.slice(0, maxChars);
  if (paragraphs.length === 1) return paragraphs[0].slice(0, maxChars);

  const scored = paragraphs.map(p => {
    const words = new Set(
      p.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 2),
    );
    return { p, score: words.size / Math.sqrt(p.length) };
  });

  return scored.sort((a, b) => b.score - a.score)[0].p.slice(0, maxChars);
}
