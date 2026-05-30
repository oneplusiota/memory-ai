/**
 * ProviderConfig — provider-agnostic key storage and config loading.
 *
 * This module owns all SecureStore reads/writes for LLM provider credentials
 * and model preferences. It is the single source of truth for persisted
 * provider settings across Gemini, Groq, and Claude.
 *
 * Gemini-specific runtime utilities (transcribeAudio, correctTranscript) live
 * in src/services/gemini/GeminiClient.ts.
 */

import * as SecureStore from 'expo-secure-store';
import {
  setGeminiKey, setGeminiModel,
  setGroqKey, setGroqModel,
  setClaudeKey, setClaudeModel,
  setActiveProvider,
} from '@/services/llm/LLMClient';
import { setCachedGeminiKey } from '@/services/gemini/GeminiClient';
import type { LLMProvider } from '@/types';

const GEMINI_KEY_STORE = 'gemini_api_key';
const GROQ_KEY_STORE = 'groq_api_key';
const CLAUDE_KEY_STORE = 'claude_api_key';
const GEMINI_MODEL_STORE = 'gemini_model';
const GROQ_MODEL_STORE = 'groq_model';
const CLAUDE_MODEL_STORE = 'claude_model';
const ACTIVE_PROVIDER_STORE = 'active_provider';

// ── Bootstrap ──────────────────────────────────────────────────────────────

/** Load all persisted provider config into in-memory LLMClient state. */
export async function loadAllProviderConfig(): Promise<void> {
  const geminiKey = await SecureStore.getItemAsync(GEMINI_KEY_STORE);
  const groqKey = await SecureStore.getItemAsync(GROQ_KEY_STORE);
  const claudeKey = await SecureStore.getItemAsync(CLAUDE_KEY_STORE);
  const geminiModel = await SecureStore.getItemAsync(GEMINI_MODEL_STORE);
  const groqModel = await SecureStore.getItemAsync(GROQ_MODEL_STORE);
  const claudeModel = await SecureStore.getItemAsync(CLAUDE_MODEL_STORE);
  const activeProvider = (await SecureStore.getItemAsync(ACTIVE_PROVIDER_STORE)) as LLMProvider | null;

  if (geminiKey) { setCachedGeminiKey(geminiKey); setGeminiKey(geminiKey); }
  if (groqKey) setGroqKey(groqKey);
  if (claudeKey) setClaudeKey(claudeKey);
  if (geminiModel) setGeminiModel(geminiModel);
  if (groqModel) setGroqModel(groqModel);
  if (claudeModel) setClaudeModel(claudeModel);
  if (activeProvider) setActiveProvider(activeProvider);
}

/** Read all stored keys/prefs for display in the Settings UI. */
export async function loadStoredKeys(): Promise<{
  geminiKey: string;
  groqKey: string;
  claudeKey: string;
  activeProvider: LLMProvider;
  geminiModel: string;
  groqModel: string;
  claudeModel: string;
}> {
  const geminiKey = (await SecureStore.getItemAsync(GEMINI_KEY_STORE)) ?? '';
  const groqKey = (await SecureStore.getItemAsync(GROQ_KEY_STORE)) ?? '';
  const claudeKey = (await SecureStore.getItemAsync(CLAUDE_KEY_STORE)) ?? '';
  const activeProvider = ((await SecureStore.getItemAsync(ACTIVE_PROVIDER_STORE)) ?? 'gemini') as LLMProvider;
  const geminiModel = (await SecureStore.getItemAsync(GEMINI_MODEL_STORE)) ?? 'gemini-2.0-flash';
  const groqModel = (await SecureStore.getItemAsync(GROQ_MODEL_STORE)) ?? 'llama-3.3-70b-versatile';
  const claudeModel = (await SecureStore.getItemAsync(CLAUDE_MODEL_STORE)) ?? 'claude-sonnet-4-6';
  return { geminiKey, groqKey, claudeKey, activeProvider, geminiModel, groqModel, claudeModel };
}

// ── Save helpers ───────────────────────────────────────────────────────────

export async function saveGeminiKey(key: string): Promise<void> {
  setCachedGeminiKey(key);
  setGeminiKey(key);
  await SecureStore.setItemAsync(GEMINI_KEY_STORE, key);
}

export async function saveGroqKey(key: string): Promise<void> {
  setGroqKey(key);
  await SecureStore.setItemAsync(GROQ_KEY_STORE, key);
}

export async function saveClaudeKey(key: string): Promise<void> {
  setClaudeKey(key);
  await SecureStore.setItemAsync(CLAUDE_KEY_STORE, key);
}

export async function saveActiveProvider(provider: LLMProvider): Promise<void> {
  setActiveProvider(provider);
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_STORE, provider);
}

export async function saveGeminiModelPref(model: string): Promise<void> {
  setGeminiModel(model);
  await SecureStore.setItemAsync(GEMINI_MODEL_STORE, model);
}

export async function saveGroqModelPref(model: string): Promise<void> {
  setGroqModel(model);
  await SecureStore.setItemAsync(GROQ_MODEL_STORE, model);
}

export async function saveClaudeModelPref(model: string): Promise<void> {
  setClaudeModel(model);
  await SecureStore.setItemAsync(CLAUDE_MODEL_STORE, model);
}
