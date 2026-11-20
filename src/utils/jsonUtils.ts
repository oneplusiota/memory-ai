/**
 * Parses JSON from an LLM reply. Smaller / free models often wrap the object in
 * ```json fences or add a sentence around it, so strip those before parsing.
 * Throws if no JSON object can be recovered.
 */
export function parseModelJson<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to lenient extraction
  }
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    // fall through
  }
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(unfenced.slice(start, end + 1)) as T;
  }
  throw new Error('Model did not return valid JSON.');
}
