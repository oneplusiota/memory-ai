import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type VoiceState = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

// Android restarts a recognizer session after silence; these are normal, not failures.
const BENIGN_ERRORS = new Set(['no-speech', 'speech-timeout', 'aborted']);
// Retrying can't fix these.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed']);
const MAX_REAL_ERRORS = 5;
const MAX_SILENT_RESTARTS = 8;
// If the native 'end' event never arrives after stop(), force the UI back to idle.
const STOP_TIMEOUT_MS = 2500;

const LANG = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
})();

function recognitionOptions(onDevice: boolean) {
  return {
    lang: LANG,
    interimResults: true,
    continuous: true,
    addsPunctuation: true,
    requiresOnDeviceRecognition: onDevice,
  };
}

/**
 * Continuous speech-to-text on top of Android's SpeechRecognizer.
 *
 * Lifecycle: the native recognizer always emits `end` when a session finishes
 * (after stop, silence timeout, or error), so `end` is the single place where
 * we decide between "finished" and "restart to keep the mic open".
 */
export function useVoice(
  onAppend: (partial: string) => void,
  onFinalAppend: (segment: string) => void,
) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Latest callbacks, so native event handlers never see stale closures
  const onAppendRef = useRef(onAppend);
  const onFinalRef = useRef(onFinalAppend);
  onAppendRef.current = onAppend;
  onFinalRef.current = onFinalAppend;

  const wantRef = useRef(false);        // user wants the mic on
  const activeRef = useRef(false);      // a native session is alive (until its 'end')
  const lastPartialRef = useRef('');    // uncommitted partial text of the current segment
  const lastErrorRef = useRef<string | null>(null);
  const fatalRef = useRef(false);
  const realErrorCountRef = useRef(0);
  const silentRestartCountRef = useRef(0);
  const onDeviceRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitersRef = useRef<Array<() => void>>([]);

  const clearTimers = () => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    restartTimerRef.current = null;
    stopTimerRef.current = null;
  };

  const flushWaiters = () => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    waiters.forEach((w) => w());
  };

  const commitPartial = () => {
    const pending = lastPartialRef.current;
    lastPartialRef.current = '';
    if (pending.trim()) onFinalRef.current(pending);
  };

  const begin = useCallback(() => {
    activeRef.current = true;
    ExpoSpeechRecognitionModule.start(recognitionOptions(onDeviceRef.current));
  }, []);

  // ── Native events ───────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => {
    if (wantRef.current) setState('listening');
  });

  useSpeechRecognitionEvent('result', (event) => {
    // Accepted even while stopping: stop() asks the recognizer to flush its final result.
    if (!activeRef.current) return;
    const text = event.results[0]?.transcript ?? '';
    if (!text) return;
    realErrorCountRef.current = 0;
    silentRestartCountRef.current = 0;
    if (event.isFinal) {
      lastPartialRef.current = '';
      onFinalRef.current(text);
    } else {
      lastPartialRef.current = text;
      onAppendRef.current(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    const code = String(event.error ?? 'unknown');
    lastErrorRef.current = code;
    if (!wantRef.current) return; // errors during/after a user stop are expected

    if (code === 'network' && !onDeviceRef.current && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      onDeviceRef.current = true; // offline: retry with the on-device recognizer
    } else if (code === 'language-not-supported' && onDeviceRef.current) {
      onDeviceRef.current = false; // on-device pack missing: go back to the online recognizer
    } else if (code === 'language-not-supported') {
      fatalRef.current = true;
      setError(`Speech recognition doesn't support "${LANG}" on this device.`);
    } else if (FATAL_ERRORS.has(code)) {
      fatalRef.current = true;
      setError(
        code === 'not-allowed'
          ? 'Microphone permission denied — enable it in Android Settings → Apps → memory.ai.'
          : 'Speech recognition service is unavailable. Enable Google voice typing in Android settings.',
      );
    }
    // Restart (or giving up) is decided in 'end', which always follows an error.
  });

  useSpeechRecognitionEvent('end', () => {
    activeRef.current = false;
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    commitPartial();

    const lastError = lastErrorRef.current;
    lastErrorRef.current = null;

    if (!wantRef.current) {
      setState('idle');
      flushWaiters();
      return;
    }

    if (fatalRef.current) {
      wantRef.current = false;
      fatalRef.current = false;
      setState('error');
      flushWaiters();
      return;
    }

    if (lastError && !BENIGN_ERRORS.has(lastError)) {
      realErrorCountRef.current += 1;
      if (realErrorCountRef.current > MAX_REAL_ERRORS) {
        wantRef.current = false;
        setError('Speech recognition keeps failing — check your connection and tap the mic to retry.');
        setState('error');
        flushWaiters();
        return;
      }
    } else {
      silentRestartCountRef.current += 1;
      if (silentRestartCountRef.current > MAX_SILENT_RESTARTS) {
        // Nothing heard for a long while — release the mic instead of listening forever
        wantRef.current = false;
        setState('idle');
        flushWaiters();
        return;
      }
    }

    // 'busy'/'client' errors mean the old session hasn't fully released the mic yet
    const delay = lastError === 'busy' || lastError === 'client' ? 800 : 250;
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (wantRef.current) begin();
    }, delay);
  });

  // ── Controls ────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (wantRef.current) return;
    wantRef.current = true;
    fatalRef.current = false;
    realErrorCountRef.current = 0;
    silentRestartCountRef.current = 0;
    setError(null);
    setState('starting');

    // A previous session is still winding down; its 'end' will see wantRef and restart.
    if (activeRef.current) return;

    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      wantRef.current = false;
      setError(
        perm.canAskAgain === false
          ? 'Microphone permission denied — enable it in Android Settings → Apps → memory.ai.'
          : 'Microphone permission denied.',
      );
      setState('error');
      return;
    }
    if (!wantRef.current) return; // stopped while the permission dialog was open
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      wantRef.current = false;
      setError('No speech recognition service found. Enable Google voice typing in Android settings.');
      setState('error');
      return;
    }
    begin();
  }, [begin]);

  /** Stops the mic; resolves once the recognizer has flushed its final result. */
  const stopListening = useCallback((): Promise<void> => {
    wantRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (!activeRef.current) {
      setState((s) => (s === 'error' ? s : 'idle'));
      return Promise.resolve();
    }
    setState('stopping');
    return new Promise<void>((resolve) => {
      waitersRef.current.push(resolve);
      ExpoSpeechRecognitionModule.stop();
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      stopTimerRef.current = setTimeout(() => {
        stopTimerRef.current = null;
        if (activeRef.current) {
          ExpoSpeechRecognitionModule.abort();
          activeRef.current = false;
        }
        commitPartial();
        setState('idle');
        flushWaiters();
      }, STOP_TIMEOUT_MS);
    });
  }, []);

  /** Immediately drops the session and any uncommitted text. */
  const reset = useCallback(() => {
    wantRef.current = false;
    lastPartialRef.current = '';
    clearTimers();
    if (activeRef.current) {
      ExpoSpeechRecognitionModule.abort();
      activeRef.current = false;
    }
    setState('idle');
    setError(null);
    flushWaiters();
  }, []);

  // Release the mic when leaving the screen or backgrounding the app
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && wantRef.current) stopListening();
    });
    return () => {
      sub.remove();
      wantRef.current = false;
      clearTimers();
      if (activeRef.current) ExpoSpeechRecognitionModule.abort();
    };
  }, [stopListening]);

  const isRecording = state === 'starting' || state === 'listening';

  return { state, isRecording, error, startListening, stopListening, reset };
}
