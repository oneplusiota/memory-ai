import { useCallback, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { transcribeAudio, correctTranscript } from '@/services/gemini/GeminiClient';
import type { STTMode } from '@/types';

export type VoiceState = 'idle' | 'listening' | 'done' | 'error';

export function useVoice(
  onAppend: (text: string) => void,
  onFinalAppend: (text: string) => void,
  sttMode: STTMode = 'native',
) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  // Starts true so spurious module-init events don't auto-start the mic
  const userStoppedRef = useRef(true);
  // Track any pending auto-restart timer so we can cancel it on manual stop
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Count consecutive silent restarts — if too many, declare STT unavailable
  const restartCountRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ── Native STT events ──────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => {
    if (sttMode !== 'native' && sttMode !== 'native-corrected') return;
    if (userStoppedRef.current) return;
    setState('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (sttMode !== 'native' && sttMode !== 'native-corrected') return;
    // Drop in-flight results that arrive after the user has stopped
    if (userStoppedRef.current) return;
    // A successful result means STT is healthy — reset the restart counter
    restartCountRef.current = 0;
    const segment = event.results[0]?.transcript ?? '';
    if (event.isFinal) {
      onFinalAppend(segment);
    } else {
      onAppend(segment);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (sttMode !== 'native' && sttMode !== 'native-corrected') return;
    if (userStoppedRef.current) {
      // User tapped stop — finish
      setState('done');
    } else {
      // Android stopped due to silence timeout — restart silently to keep mic open
      restartCountRef.current += 1;
      if (restartCountRef.current > 4) {
        // Too many silent restarts — STT is silently failing, surface an error
        setError('Speech recognition unavailable — tap the mic to try again');
        setState('error');
        userStoppedRef.current = true;
        return;
      }
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        // Guard: if the user stopped while the timer was pending, abort
        if (userStoppedRef.current) return;
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: true,
        });
      }, 300);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (sttMode !== 'native' && sttMode !== 'native-corrected') return;
    const code = String((event as any).code ?? '');
    const message = String((event as any).message ?? '').toLowerCase();
    // Recoverable conditions — don't surface as errors, just restart silently
    // Android codes: 4=ERROR_SERVER, 5=ERROR_CLIENT, 6=ERROR_SPEECH_TIMEOUT,
    //                7=ERROR_NO_MATCH, 13=ERROR_SERVER_DISCONNECTED
    const recoverable =
      code === 'no-speech' ||
      code === 'aborted' ||
      code === 'network' ||
      code === '4' ||
      code === '5' ||
      code === '6' ||
      code === '7' ||
      code === '13' ||
      message.includes('server') ||
      message.includes('disconnected');
    if (!userStoppedRef.current && recoverable) {
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (userStoppedRef.current) return;
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: true,
        });
      }, 300);
      return;
    }
    if (!userStoppedRef.current) {
      setError(event.message ?? 'Speech recognition error');
    }
    setState(userStoppedRef.current ? 'done' : 'idle');
  });

  // ── Start listening ────────────────────────────────────────────
  const startListening = useCallback(async () => {
    setError(null);
    userStoppedRef.current = false;

    if (sttMode === 'gemini-audio') {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setError('Microphone permission denied');
        setState('error');
        return;
      }
      recorder.record();
      setState('listening');
      return;
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone permission denied');
      setState('error');
      return;
    }
    restartCountRef.current = 0;
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
    });
  }, [sttMode, recorder]);

  // ── Stop listening (user-initiated) ───────────────────────────
  const stopListening = useCallback(async () => {
    // Cancel any pending auto-restart before marking as stopped
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    userStoppedRef.current = true;

    if (sttMode === 'gemini-audio') {
      await recorder.stop();
      const uri = recorder.uri;
      setState('done');
      if (uri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const transcript = await transcribeAudio(base64, 'audio/m4a');
          onFinalAppend(transcript);
        } catch (e: any) {
          setError(e.message ?? 'Transcription failed');
          setState('error');
        }
      }
      return;
    }

    // Optimistically transition state — the 'end' event may be delayed or never fire
    // (e.g. when the recognizer crashes or the connection drops on Android)
    setState('done');
    ExpoSpeechRecognitionModule.stop();
  }, [sttMode, recorder, onFinalAppend]);

  const postCorrect = useCallback(async (rawTranscript: string): Promise<string> => {
    if (sttMode !== 'native-corrected') return rawTranscript;
    try {
      return await correctTranscript(rawTranscript);
    } catch {
      return rawTranscript;
    }
  }, [sttMode]);

  const reset = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    userStoppedRef.current = true;
    setState('idle');
    setError(null);
  }, []);

  return { state, error, startListening, stopListening, postCorrect, reset };
}
