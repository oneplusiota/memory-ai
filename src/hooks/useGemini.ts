import { useCallback, useState } from 'react';
import { llmChat } from '@/services/llm/LLMClient';
import type { LLMMessage } from '@/services/llm/LLMClient';
import { buildRoutingPrompt, SYSTEM_PROMPT } from '@/services/gemini/RoutingPrompt';
import { ROUTING_RESPONSE_SCHEMA } from '@/services/gemini/RoutingSchema';
import { hybridSearch } from '@/services/search/HybridSearch';
import { getIndex } from '@/services/indexer/IndexStore';
import type { RoutingDecision } from '@/types';

export type GeminiState = 'idle' | 'searching' | 'calling' | 'done' | 'error';

const ROUTING_SCHEMA_DESCRIPTION = `{
  "action": "update_atom" | "create_atom" | "log_only" | "link_notes",
  "target_note": "string",
  "atom_content": "string",
  "daily_entry": "string",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string"
}`;

export function useGemini() {
  const [geminiState, setGeminiState] = useState<GeminiState>('idle');
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const route = useCallback(async (transcript: string): Promise<RoutingDecision | null> => {
    setGeminiState('searching');
    setError(null);
    try {
      const index = getIndex();
      const results = hybridSearch(index, transcript, undefined, 5);
      const candidates = results.map((r) => r.note);

      setGeminiState('calling');
      const prompt = buildRoutingPrompt(transcript, candidates);
      const messages: LLMMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ];
      const text = await llmChat(messages, ROUTING_RESPONSE_SCHEMA, ROUTING_SCHEMA_DESCRIPTION);
      const dec = JSON.parse(text) as RoutingDecision;
      setDecision(dec);
      setGeminiState('done');
      return dec;
    } catch (e: any) {
      setError(e.message ?? 'AI error');
      setGeminiState('error');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setGeminiState('idle');
    setDecision(null);
    setError(null);
  }, []);

  return { geminiState, decision, error, route, reset };
}
