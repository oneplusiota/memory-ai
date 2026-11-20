import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';

const normalize = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * A text box you can fill by voice or keyboard.
 * `committed` is the text already finalised; `text` is what the box shows
 * (committed + the recognizer's live partial).
 */
export function useDictation() {
  const committedRef = useRef('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onPartial = useCallback((partial: string) => {
    const p = partial.trim();
    if (!p) return;
    const base = committedRef.current;
    setText(normalize(base ? `${base} ${p}` : p));
  }, []);

  const onFinal = useCallback((segment: string) => {
    const s = segment.trim();
    if (!s) return;
    const next = normalize(committedRef.current ? `${committedRef.current} ${s}` : s);
    committedRef.current = next;
    setText(next);
  }, []);

  const voice = useVoice(onPartial, onFinal);

  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

  /** Keyboard edits replace the committed text so voice continues from what's on screen. */
  const onChangeText = useCallback((next: string) => {
    committedRef.current = normalize(next);
    setText(next);
  }, []);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (voice.isRecording) await voice.stopListening();
      else await voice.startListening();
    } catch (e: any) {
      setError(e?.message ?? 'Microphone error. Check permissions in Android settings.');
    }
  }, [voice]);

  /** Stops the mic, waits for the recognizer's last words, and returns the final text. */
  const finish = useCallback(async (): Promise<string> => {
    await voice.stopListening();
    return committedRef.current.trim();
  }, [voice]);

  const clear = useCallback(() => {
    committedRef.current = '';
    setText('');
    voice.reset();
  }, [voice]);

  return { text, onChangeText, isRecording: voice.isRecording, error, toggle, finish, clear };
}
