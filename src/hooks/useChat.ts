import { useCallback, useRef, useState } from 'react';
import { agentChat } from '@/services/tools/AgentClient';
import type { ToolStepEvent } from '@/services/tools/AgentClient';
import { TOOL_DEFINITIONS } from '@/services/tools/EntryTools';
import { buildSystemPrompt } from '@/services/chat/ChatPrompt';
import type { ConversationMessage } from '@/types';

let idCounter = 0;
const mkId = () => `m${++idCounter}`;

export function useChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesRef = useRef<ConversationMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ToolStepEvent | null>(null);
  const busyRef = useRef(false);

  const push = (m: ConversationMessage) => {
    messagesRef.current = [...messagesRef.current, m];
    setMessages(messagesRef.current);
  };

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busyRef.current) return;
    busyRef.current = true;
    setIsSending(true);
    setError(null);
    setStep(null);

    const history = messagesRef.current;
    push({ id: mkId(), role: 'user', text: question, timestamp: Date.now() });
    try {
      const reply = await agentChat(history, question, buildSystemPrompt(), TOOL_DEFINITIONS, setStep);
      push({ id: mkId(), role: 'assistant', text: reply || '…', timestamp: Date.now() });
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setIsSending(false);
      setStep(null);
      busyRef.current = false;
    }
  }, []);

  const clear = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setError(null);
  }, []);

  return { messages, isSending, error, step, send, clear };
}
