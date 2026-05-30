import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import { useVault } from './useVault';
import { hybridSearch } from '@/services/search/HybridSearch';
import { getIndex } from '@/services/indexer/IndexStore';
import { chat, saveConversation } from '@/services/gemini/ConversationClient';
import { saveConversationFile, readLifeContext } from '@/services/vault/VaultWriter';
import { refreshLifeContext } from '@/services/llm/LifeContextClient';
import type { ConversationMessage, ConversationMode, RoutingDecision, STTMode } from '@/types';
import * as SecureStore from 'expo-secure-store';

const CONVERSATION_MODE_KEY = 'conversation_mode';

let msgIdCounter = 0;
const mkId = () => String(++msgIdCounter);

export function useConversation(sttMode: STTMode = 'native') {
  const { vaultUri } = useVault();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuggestSave, setLastSuggestSave] = useState(false);
  const [conversationMode, setConversationModeState] = useState<ConversationMode>('journal');
  const conversationFilePathRef = useRef<string | null>(null);
  const lifeContextRef = useRef<string | null>(null);

  // Load persisted conversation mode on mount
  useEffect(() => {
    SecureStore.getItemAsync(CONVERSATION_MODE_KEY).then((v) => {
      if (v) setConversationModeState(v as ConversationMode);
    });
  }, []);

  const setConversationMode = useCallback(async (mode: ConversationMode) => {
    setConversationModeState(mode);
    await SecureStore.setItemAsync(CONVERSATION_MODE_KEY, mode);
  }, []);

  // Load life context once vault is available
  useEffect(() => {
    if (!vaultUri) return;
    readLifeContext(vaultUri).then(ctx => { lifeContextRef.current = ctx; }).catch(() => {});
  }, [vaultUri]);

  const baseRef = useRef('');
  const [transcript, setTranscript] = useState('');

  const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();

  const handleTranscriptChange = useCallback((text: string) => {
    baseRef.current = normalize(text);
    setTranscript(text);
  }, []);

  const handleAppend = useCallback((partial: string) => {
    const trimmed = partial.trim();
    if (!trimmed) return;
    const base = baseRef.current;
    const combined = normalize(base ? `${base} ${trimmed}` : trimmed);
    setTranscript(combined);
  }, []);

  const handleFinalAppend = useCallback((segment: string) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const updated = normalize(baseRef.current ? `${baseRef.current} ${trimmed}` : trimmed);
    baseRef.current = updated;
    setTranscript(updated);
  }, []);

  const { state: voiceState, startListening, stopListening, postCorrect, reset: resetVoice } = useVoice(
    handleAppend, handleFinalAppend, sttMode,
  );

  const isRecording = voiceState === 'listening';

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopListening();
    } else {
      await startListening();
    }
  }, [isRecording, startListening, stopListening]);

  const sendMessage = useCallback(async (text: string) => {
    const finalText = sttMode === 'native-corrected' ? await postCorrect(text) : text;
    if (!finalText.trim()) return;

    setIsSending(true);
    setError(null);
    baseRef.current = '';
    setTranscript('');

    const userMsg: ConversationMessage = {
      id: mkId(), role: 'user', text: finalText.trim(), timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const index = getIndex();
      const results = hybridSearch(index, finalText, undefined, 5);
      const notes = results.map((r) => r.note);
      const allMessages = [...messages, userMsg];

      const allAtoms = Object.values(index.notes).filter(n => n.id.startsWith('atoms/'));

      const response = await chat(allMessages, notes, finalText, allAtoms, lifeContextRef.current ?? undefined, conversationMode);
      const aiMsg: ConversationMessage = {
        id: mkId(), role: 'assistant', text: response.reply, timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLastSuggestSave(response.suggest_save);

      // Refresh life context in background every 5 user messages
      const userMsgCount = allMessages.filter(m => m.role === 'user').length;
      if (vaultUri && userMsgCount % 5 === 0) {
        refreshLifeContext(vaultUri, allMessages).then(updated => {
          if (updated) lifeContextRef.current = updated;
        }).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setIsSending(false);
      resetVoice();
    }
  }, [messages, sttMode, postCorrect, resetVoice]);

  const saveToVault = useCallback(async (): Promise<{
    decision: RoutingDecision;
    vaultUri: string;
    conversationFilePath: string | null;
  } | null> => {
    if (!vaultUri || messages.length === 0) return null;
    try {
      const index = getIndex();
      const allAtoms = Object.values(index.notes).filter(n => n.id.startsWith('atoms/'));
      const decision = await saveConversation(messages, allAtoms);
      return { decision, vaultUri, conversationFilePath: conversationFilePathRef.current };
    } catch (e: any) {
      setError(e.message ?? 'Failed to get save decision');
      return null;
    }
  }, [vaultUri, messages]);

  const persistConversation = useCallback(async () => {
    if (!vaultUri || messages.length === 0 || conversationFilePathRef.current) return;
    try {
      const path = await saveConversationFile(vaultUri, messages, false, []);
      conversationFilePathRef.current = path;
    } catch {
      // best-effort
    }
    // Update life context with anything shared in this conversation
    refreshLifeContext(vaultUri, messages).then(updated => {
      if (updated) lifeContextRef.current = updated;
    }).catch(() => {});
  }, [vaultUri, messages]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setLastSuggestSave(false);
    conversationFilePathRef.current = null;
    baseRef.current = '';
    setTranscript('');
    resetVoice();
  }, [resetVoice]);

  return {
    messages,
    transcript,
    isRecording,
    isSending,
    error,
    lastSuggestSave,
    voiceState,
    conversationMode,
    setConversationMode,
    handleTranscriptChange,
    toggleRecording,
    sendMessage,
    saveToVault,
    persistConversation,
    clearConversation,
  };
}
