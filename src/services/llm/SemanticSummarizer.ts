import { llmChat } from '@/services/llm/LLMClient';

/**
 * Generates a dense semantic summary of a note using the active LLM.
 * Called at enrich-time (user-initiated), not per query.
 * In Phase 2 this will be superseded by on-device ONNX embeddings.
 */
export async function generateSemanticSummary(content: string, title: string): Promise<string> {
  const truncated = content.slice(0, 2000);
  const result = await llmChat([
    {
      role: 'system',
      content:
        'You are a knowledge indexing assistant. Write 2–3 dense sentences that capture ' +
        'the key themes, people, concepts, emotions, and intent of the note below. ' +
        'Be specific — mention names, topics, and relationships explicitly. ' +
        'Return only the summary, nothing else.',
    },
    { role: 'user', content: `Note title: ${title}\n\n${truncated}` },
  ]);
  return result.trim();
}
