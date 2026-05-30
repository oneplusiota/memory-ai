/**
 * GeminiClient — Gemini-specific runtime utilities.
 *
 * Provider config (key storage, model prefs) lives in ProviderConfig.ts.
 * LLM chat routing lives in LLMClient.ts.
 */

import { llmChat } from '@/services/llm/LLMClient';

// Cached separately from LLMClient because transcribeAudio calls the
// Gemini REST API directly (multimodal, no Groq/Claude equivalent).
let cachedGeminiKey: string | null = null;

export function setCachedGeminiKey(key: string): void {
  cachedGeminiKey = key;
}

// Gemini-only: audio transcription (no Groq equivalent)
export async function transcribeAudio(base64Audio: string, mimeType: string = 'audio/m4a'): Promise<string> {
  if (!cachedGeminiKey) throw new Error('No Gemini API key for transcription.');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cachedGeminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Audio } },
            { text: 'Transcribe the speech in this audio exactly as spoken. Return only the transcription, no other text.' },
          ],
        }],
      }),
    },
  );
  if (!response.ok) throw new Error(`Gemini transcription error ${response.status}`);
  const data = await response.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

// Transcript correction — uses whichever LLM provider is currently active
export async function correctTranscript(rawTranscript: string): Promise<string> {
  const result = await llmChat([
    {
      role: 'system',
      content:
        'You are a speech-to-text post-processor. Your ONLY job is to fix STT recognition errors ' +
        '(wrong words, missing punctuation, run-on sentences) while keeping the meaning and intent ' +
        'exactly as the speaker intended. ' +
        'Do NOT answer, respond to, or comment on the content. ' +
        'Do NOT add any preamble or explanation. ' +
        'Return ONLY the corrected transcript text and nothing else.',
    },
    {
      role: 'user',
      content: `Correct this STT transcript:\n\n${rawTranscript}`,
    },
  ]);
  return result.trim() || rawTranscript;
}
