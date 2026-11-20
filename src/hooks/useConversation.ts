import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import { useVault } from './useVault';
import { getAllNotes } from '@/services/db/VaultDB';
import { chat } from '@/services/gemini/ConversationClient';
import { buildSystemPrompt, buildIndexBlock } from '@/services/gemini/ConversationPrompt';
import { agentChat } from '@/services/tools/AgentClient';
import type { ToolStepEvent } from '@/services/tools/AgentClient';
import { BUILTIN_TOOL_DEFINITIONS } from '@/services/tools/BuiltinTools';
import type { ConversationMessage } from '@/types';

let msgIdCounter = 0;
const mkId = () => String(++msgIdCounter);

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();

export function useConversation() {
  const { vaultUri } = useVault();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolSteps, setToolSteps] = useState<ToolStepEvent[]>([]);
  const confirmCallbackRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string;
    path: string;
    content: string;
  } | null>(null);

  const confirmToolWrite = useCallback((confirmed: boolean) => {
    confirmCallbackRef.current?.(confirmed);
    confirmCallbackRef.current = null;
    setPendingConfirm(null);
  }, []);

  // `baseRef` is the committed text; `transcript` is what the box shows (committed + live partial)
  const baseRef = useRef('');
  const [transcript, setTranscript] = useState('');

  const handleTranscriptChange = useCallback((text: string) => {
    baseRef.current = normalize(text);
    setTranscript(text);
  }, []);

  const handleAppend = useCallback((partial: string) => {
    const trimmed = partial.trim();
    if (!trimmed) return;
    const base = baseRef.current;
    setTranscript(normalize(base ? `${base} ${trimmed}` : trimmed));
  }, []);

  const handleFinalAppend = useCallback((segment: string) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const updated = normalize(baseRef.current ? `${baseRef.current} ${trimmed}` : trimmed);
    baseRef.current = updated;
    setTranscript(updated);
  }, []);

  const { isRecording, error: voiceError, startListening, stopListening, reset: resetVoice } = useVoice(
    handleAppend, handleFinalAppend,
  );

  // Surface voice errors (permission denied, recognizer unavailable, etc.) to the UI
  useEffect(() => {
    if (voiceError) setError(voiceError);
  }, [voiceError]);

  const toggleRecording = useCallback(async () => {
    setError(null);
    try {
      if (isRecording) {
        await stopListening();
      } else {
        await startListening();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Microphone error. Check permissions in device Settings.');
    }
  }, [isRecording, startListening, stopListening]);

  const sendText = useCallback(async (finalText: string) => {
    setIsSending(true);
    setError(null);
    baseRef.current = '';
    setTranscript('');

    const userMsg: ConversationMessage = {
      id: mkId(), role: 'user', text: finalText, timestamp: Date.now(),
    };
    const withUser = [...messagesRef.current, userMsg];
    setMessages(withUser);
    messagesRef.current = withUser;

    try {
      setToolSteps([]);
      let replyText: string;

      if (vaultUri) {
        const indexBlock = buildIndexBlock(await getAllNotes());
        replyText = await agentChat(
          withUser.slice(0, -1), // history without the new user msg (agentChat appends it)
          finalText,
          buildSystemPrompt(true, indexBlock),
          BUILTIN_TOOL_DEFINITIONS,
          vaultUri,
          {
            onStep: (event) => setToolSteps(prev => [...prev, event]),
            onConfirmRequired: (toolName, path, content) =>
              new Promise<boolean>((resolve) => {
                confirmCallbackRef.current = resolve;
                setPendingConfirm({ toolName, path, content });
              }),
          },
        );
      } else {
        replyText = await chat(withUser);
      }

      const aiMsg: ConversationMessage = {
        id: mkId(), role: 'assistant', text: replyText, timestamp: Date.now(),
      };
      const withAI = [...withUser, aiMsg];
      setMessages(withAI);
      messagesRef.current = withAI;
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setIsSending(false);
      resetVoice();
    }
  }, [resetVoice, vaultUri]);

  const sendingRef = useRef(false);

  /** Stops the mic (waiting for the recognizer's last words), then sends whatever is in the box. */
  const sendMessage = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      await stopListening();
      const finalText = baseRef.current.trim();
      if (!finalText) return;
      await sendText(finalText);
    } finally {
      sendingRef.current = false;
    }
  }, [stopListening, sendText]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
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
    toolSteps,
    pendingConfirm,
    confirmToolWrite,
    handleTranscriptChange,
    toggleRecording,
    sendMessage,
    clearConversation,
  };
}
