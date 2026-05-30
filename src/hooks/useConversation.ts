import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import { useVault } from './useVault';
import { searchNotes } from '@/services/search/HybridSearch';
import { getAllNotes } from '@/services/db/VaultDB';
import { embed as gloveEmbed, isReady as gloveReady } from '@/services/search/GloveService';
import { chat, saveConversation } from '@/services/gemini/ConversationClient';
import { buildSystemPrompt } from '@/services/gemini/ConversationPrompt';
import { saveConversationFile, readConversationMessages, overwriteConversationFile, readLifeContext } from '@/services/vault/VaultWriter';
import { refreshLifeContext } from '@/services/llm/LifeContextClient';
import { agentChat } from '@/services/tools/AgentClient';
import type { ToolStepEvent } from '@/services/tools/AgentClient';
import { BUILTIN_TOOL_DEFINITIONS } from '@/services/tools/BuiltinTools';
import { WEB_SEARCH_TOOL_DEFINITION } from '@/services/tools/WebSearchClient';
import { CALENDAR_TOOL_DEFINITIONS } from '@/services/tools/CalendarClient';
import { loadCustomTools } from '@/services/tools/ToolRegistry';
import type { AgentMode, ConversationMessage, ConversationMode, RoutingDecision, STTMode, ToolDefinition } from '@/types';
import * as SecureStore from 'expo-secure-store';

const AGENT_MODE_KEY = 'agent_mode';

const CONVERSATION_MODE_KEY = 'conversation_mode';

let msgIdCounter = 0;
const mkId = () => String(++msgIdCounter);

export function useConversation(sttMode: STTMode = 'native', initialMode?: ConversationMode) {
  const { vaultUri } = useVault();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuggestSave, setLastSuggestSave] = useState(false);
  const [conversationMode, setConversationModeState] = useState<ConversationMode>(initialMode ?? 'journal');
  const conversationFilePathRef = useRef<string | null>(null);
  const lifeContextRef = useRef<string | null>(null);

  // Keep ref in sync so persistConversation never reads a stale closure
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load persisted conversation mode on mount; skip if caller supplied initialMode
  useEffect(() => {
    if (initialMode) return;
    SecureStore.getItemAsync(CONVERSATION_MODE_KEY).then((v) => {
      if (v) setConversationModeState(v as ConversationMode);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Agent / tools state ──────────────────────────────────────────────────
  const [agentMode, setAgentModeState] = useState<AgentMode>('agentic');
  const [customTools, setCustomTools] = useState<ToolDefinition[]>([]);
  const [toolSteps, setToolSteps] = useState<ToolStepEvent[]>([]);
  const confirmCallbackRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    toolName: string;
    path: string;
    content: string;
  } | null>(null);

  // Load agent settings and custom tools when vault is ready
  useEffect(() => {
    SecureStore.getItemAsync(AGENT_MODE_KEY).then(v => {
      if (v) setAgentModeState(v as AgentMode);
    });
  }, []);

  useEffect(() => {
    if (!vaultUri) return;
    loadCustomTools(vaultUri).then(setCustomTools).catch(() => {});
  }, [vaultUri]);

  const setAgentMode = useCallback(async (mode: AgentMode) => {
    setAgentModeState(mode);
    await SecureStore.setItemAsync(AGENT_MODE_KEY, mode);
  }, []);

  const confirmToolWrite = useCallback((confirmed: boolean) => {
    confirmCallbackRef.current?.(confirmed);
    confirmCallbackRef.current = null;
    setPendingConfirm(null);
  }, []);

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

  const { state: voiceState, error: voiceError, startListening, stopListening, postCorrect, reset: resetVoice } = useVoice(
    handleAppend, handleFinalAppend, sttMode,
  );

  const isRecording = voiceState === 'listening';

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

  const autosave = useCallback((msgs: ConversationMessage[]) => {
    if (!vaultUri || msgs.length === 0) return;
    if (conversationFilePathRef.current) {
      overwriteConversationFile(vaultUri, conversationFilePathRef.current, msgs).catch(() => {});
    } else {
      saveConversationFile(vaultUri, msgs, false, []).then((path) => {
        conversationFilePathRef.current = path;
      }).catch(() => {});
    }
  }, [vaultUri]);

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
    const withUser = [...messagesRef.current, userMsg];
    setMessages(withUser);
    messagesRef.current = withUser;

    try {
      setToolSteps([]);

      // tool_builder mode always uses the standard chat path (no tool calling)
      const useToolCalling = conversationMode !== 'tool_builder' && vaultUri;

      let replyText: string;

      if (useToolCalling) {
        const allTools: ToolDefinition[] = [
          ...BUILTIN_TOOL_DEFINITIONS,
          WEB_SEARCH_TOOL_DEFINITION,
          ...CALENDAR_TOOL_DEFINITIONS,
          ...customTools,
        ];

        replyText = await agentChat(
          withUser.slice(0, -1), // history without the new user msg (agentChat appends it)
          finalText,
          buildSystemPrompt(conversationMode),
          allTools,
          vaultUri,
          customTools,
          agentMode,
          {
            onStep: (event) => setToolSteps(prev => [...prev, event]),
            onConfirmRequired: (toolName, path, content) =>
              new Promise<boolean>((resolve) => {
                confirmCallbackRef.current = resolve;
                setPendingConfirm({ toolName, path, content });
              }),
          },
        );
        setLastSuggestSave(false);
      } else {
        const allNotes = await getAllNotes();
        const queryEmbedding = gloveReady() ? gloveEmbed(finalText) : null;
        const results = searchNotes(allNotes, finalText, 3, queryEmbedding ?? undefined);
        const notes = results.map((r) => r.note);
        const allAtoms = allNotes.filter(n => n.id.startsWith('atoms/'));
        const response = await chat(withUser, notes, finalText, allAtoms, lifeContextRef.current ?? undefined, conversationMode);
        replyText = response.reply;
        setLastSuggestSave(response.suggest_save);
      }

      const aiMsg: ConversationMessage = {
        id: mkId(), role: 'assistant', text: replyText, timestamp: Date.now(),
      };
      const withAI = [...withUser, aiMsg];
      setMessages(withAI);
      messagesRef.current = withAI;
      autosave(withAI);

      // Refresh life context in background every 5 user messages
      const userMsgCount = withAI.filter(m => m.role === 'user').length;
      if (vaultUri && userMsgCount % 5 === 0) {
        refreshLifeContext(vaultUri, withAI).then(updated => {
          if (updated) lifeContextRef.current = updated;
        }).catch(() => {});
      }
    } catch (e: any) {
      setError(e.message ?? 'Error');
    } finally {
      setIsSending(false);
      resetVoice();
    }
  }, [sttMode, postCorrect, resetVoice, autosave, conversationMode, vaultUri, agentMode, customTools]);

  const saveToVault = useCallback(async (): Promise<{
    decision: RoutingDecision;
    vaultUri: string;
    conversationFilePath: string | null;
  } | null> => {
    if (!vaultUri || messages.length === 0) return null;
    try {
      const allNotes = await getAllNotes();
      const allAtoms = allNotes.filter(n => n.id.startsWith('atoms/'));
      const decision = await saveConversation(messages, allAtoms);
      return { decision, vaultUri, conversationFilePath: conversationFilePathRef.current };
    } catch (e: any) {
      setError(e.message ?? 'Failed to get save decision');
      return null;
    }
  }, [vaultUri, messages]);

  const loadConversation = useCallback(async (filePath: string) => {
    if (!vaultUri) return;
    const loaded = await readConversationMessages(vaultUri, filePath);
    if (loaded.length === 0) return;
    messagesRef.current = loaded;
    setMessages(loaded);
    conversationFilePathRef.current = filePath;
  }, [vaultUri]);

  const persistConversation = useCallback(async () => {
    const current = messagesRef.current;
    if (!vaultUri || current.length === 0) return;
    try {
      if (conversationFilePathRef.current) {
        // Resumed conversation — update the existing file in place
        await overwriteConversationFile(vaultUri, conversationFilePathRef.current, current);
      } else {
        // New conversation — create a new file
        const path = await saveConversationFile(vaultUri, current, false, []);
        conversationFilePathRef.current = path;
      }
    } catch {
      // best-effort
    }
    // Update life context with anything shared in this conversation
    refreshLifeContext(vaultUri, current).then(updated => {
      if (updated) lifeContextRef.current = updated;
    }).catch(() => {});
  }, [vaultUri]);

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
    conversationMode,
    setConversationMode,
    agentMode,
    setAgentMode,
    customTools,
    toolSteps,
    pendingConfirm,
    confirmToolWrite,
    handleTranscriptChange,
    toggleRecording,
    sendMessage,
    saveToVault,
    loadConversation,
    persistConversation,
    clearConversation,
  };
}
