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

  const { isRecording, error: voiceError, startListening, stopListening, reset } = useVoice(onPartial, onFinal);

  useEffect(() => {
    if (voiceError) setError(voiceError);
  }, [voiceError]);

  /** Keyboard edits replace the committed text so voice continues from what's on screen. */
  const onChangeText = useCallback((next: string) => {
    committedRef.current = normalize(next);
    setText(next);
  }, []);

  // Every callback below is referentially stable, so screens can safely use them in effect deps.
  const start = useCallback(async () => {
    setError(null);
    try {
      await startListening();
    } catch (e: any) {
      setError(e?.message ?? 'Microphone error. Check permissions in Android settings.');
    }
  }, [startListening]);

  const toggle = useCallback(async () => {
    setError(null);
    try {
      if (isRecording) await stopListening();
      else await startListening();
    } catch (e: any) {
      setError(e?.message ?? 'Microphone error. Check permissions in Android settings.');
    }
  }, [isRecording, startListening, stopListening]);

  /** Stops the mic, waits for the recognizer's last words, and returns the final text. */
  const finish = useCallback(async (): Promise<string> => {
    await stopListening();
    return committedRef.current.trim();
  }, [stopListening]);

  const clear = useCallback(() => {
    committedRef.current = '';
    setText('');
    reset();
  }, [reset]);

  return { text, onChangeText, isRecording, error, start, toggle, finish, clear };
}
