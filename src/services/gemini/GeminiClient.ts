import * as SecureStore from 'expo-secure-store';
import { setGeminiKey, setGeminiModel, setGroqKey, setActiveProvider, llmChat } from '@/services/llm/LLMClient';
import type { LLMProvider } from '@/types';

const GEMINI_KEY_STORE = 'gemini_api_key';
const GROQ_KEY_STORE = 'groq_api_key';
const GEMINI_MODEL_STORE = 'gemini_model';
const ACTIVE_PROVIDER_STORE = 'active_provider';

let cachedGeminiKey: string | null = null;

export async function loadAllProviderConfig(): Promise<void> {
  const geminiKey = await SecureStore.getItemAsync(GEMINI_KEY_STORE);
  const groqKey = await SecureStore.getItemAsync(GROQ_KEY_STORE);
  const geminiModel = await SecureStore.getItemAsync(GEMINI_MODEL_STORE);
  const activeProvider = (await SecureStore.getItemAsync(ACTIVE_PROVIDER_STORE)) as LLMProvider | null;

  if (geminiKey) { cachedGeminiKey = geminiKey; setGeminiKey(geminiKey); }
  if (groqKey) setGroqKey(groqKey);
  if (geminiModel) setGeminiModel(geminiModel);
  if (activeProvider) setActiveProvider(activeProvider);
}

export async function saveGeminiKey(key: string): Promise<void> {
  cachedGeminiKey = key;
  setGeminiKey(key);
  await SecureStore.setItemAsync(GEMINI_KEY_STORE, key);
}

export async function saveGroqKey(key: string): Promise<void> {
  setGroqKey(key);
  await SecureStore.setItemAsync(GROQ_KEY_STORE, key);
}

export async function saveActiveProvider(provider: LLMProvider): Promise<void> {
  setActiveProvider(provider);
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_STORE, provider);
}

export async function saveGeminiModelPref(model: string): Promise<void> {
  setGeminiModel(model);
  await SecureStore.setItemAsync(GEMINI_MODEL_STORE, model);
}

export async function loadStoredKeys(): Promise<{ geminiKey: string; groqKey: string; activeProvider: LLMProvider; geminiModel: string }> {
  const geminiKey = (await SecureStore.getItemAsync(GEMINI_KEY_STORE)) ?? '';
  const groqKey = (await SecureStore.getItemAsync(GROQ_KEY_STORE)) ?? '';
  const activeProvider = ((await SecureStore.getItemAsync(ACTIVE_PROVIDER_STORE)) ?? 'gemini') as LLMProvider;
  const geminiModel = (await SecureStore.getItemAsync(GEMINI_MODEL_STORE)) ?? 'gemini-2.0-flash';
  return { geminiKey, groqKey, activeProvider, geminiModel };
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
      content: 'You are a speech-to-text correction assistant. Fix recognition errors while preserving the original meaning exactly. Return only the corrected text, nothing else.',
    },
    {
      role: 'user',
      content: rawTranscript,
    },
  ]);
  return result.trim() || rawTranscript;
}
