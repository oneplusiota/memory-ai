import { useCallback, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import { useVault } from './useVault';
import { hybridSearch } from '@/services/search/HybridSearch';
import { getIndex } from '@/services/indexer/IndexStore';
import type { VaultStats } from '@/types';
import { chat, saveConversation } from '@/services/gemini/ConversationClient';
import { saveConversationFile } from '@/services/vault/VaultWriter';
import type { ConversationMessage, RoutingDecision, STTMode } from '@/types';

let msgIdCounter = 0;
const mkId = () => String(++msgIdCounter);

export function useConversation(sttMode: STTMode = 'native') {
  const { vaultUri } = useVault();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuggestSave, setLastSuggestSave] = useState(false);
  const conversationFilePathRef = useRef<string | null>(null);

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
      const results = hybridSearch(index, finalText, undefined, 3);
      const notes = results.map((r) => r.note);
      const allMessages = [...messages, userMsg];

      const allIds = Object.keys(index.notes);
      const tagFreq: Record<string, number> = {};
      Object.values(index.notes).forEach(n => n.tags.forEach(t => { tagFreq[t] = (tagFreq[t] ?? 0) + 1; }));
      const topTags = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
      const vaultStats: VaultStats = {
        total: allIds.length,
        atoms: allIds.filter(id => id.startsWith('atoms/')).length,
        daily: allIds.filter(id => id.startsWith('daily/')).length,
        conversations: allIds.filter(id => id.startsWith('conversations/')).length,
        topTags,
      };

      const response = await chat(allMessages, notes, finalText, vaultStats);
      const aiMsg: ConversationMessage = {
        id: mkId(), role: 'assistant', text: response.reply, timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setLastSuggestSave(response.suggest_save);
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
      const decision = await saveConversation(messages);
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
    handleTranscriptChange,
    toggleRecording,
    sendMessage,
    saveToVault,
    persistConversation,
    clearConversation,
  };
}
