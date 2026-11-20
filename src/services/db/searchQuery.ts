/**
 * Turns free-form user input into a safe FTS5 MATCH expression.
 * Every term becomes a quoted prefix token ("meet"*) and terms are ANDed,
 * so partial words match and FTS5 syntax characters can never raise a parse error.
 * Returns null when the input has nothing searchable.
 */
export function buildMatchQuery(input: string): string | null {
  // Keep ASCII word characters and anything above Latin-1 (covers non-Latin scripts)
  const cleaned = input.toLowerCase().replace(/[^\wÀ-￿]+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned
    .split(/\s+/)
    .map((term) => `"${term}"*`)
    .join(' ');
}
