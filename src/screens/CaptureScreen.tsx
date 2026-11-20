import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDictation } from '@/hooks/useDictation';
import { addEntry } from '@/services/db/EntryDB';

/**
 * Opened by the home-screen widget. Starts listening immediately; one tap saves
 * the entry and returns to wherever you were (the launcher), so a note costs
 * two taps and zero navigation.
 */
export function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const dictation = useDictation();
  const pulse = useRef(new Animated.Value(1)).current;
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const textRef = useRef('');
  textRef.current = dictation.text;
  const { start, finish, clear, isRecording } = dictation;

  // Start listening whenever the screen comes into focus (and release it when it loses focus)
  useFocusEffect(
    useCallback(() => {
      start();
      return () => {
        clear();
      };
    }, [start, clear]),
  );

  useEffect(() => {
    if (!isRecording) {
      Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, pulse]);

  const saveAndExit = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const text = (await finish()) || textRef.current.trim();
      if (text) {
        await addEntry(text);
        setSaved(true);
        setSaveError(null);
        setTimeout(() => BackHandler.exitApp(), 450);
        return;
      }
      BackHandler.exitApp(); // nothing said — just close
    } catch (e: any) {
      // Keep the text on screen so nothing is lost
      setSaveError(e?.message ?? 'Could not save. Your text is still here — tap Save to retry.');
      savingRef.current = false;
    }
  }, [finish]);

  // Back button saves what was captured instead of throwing it away
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      saveAndExit();
      return true;
    });
    return () => sub.remove();
  }, [saveAndExit]);

  const hasText = dictation.text.trim().length > 0;
  const error = dictation.error ?? saveError;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.status}>
        {saved ? 'Saved ✓' : isRecording ? 'Listening…' : hasText ? 'Paused' : 'Tap the mic to start'}
      </Text>

      <TextInput
        style={styles.input}
        value={dictation.text}
        onChangeText={dictation.onChangeText}
        placeholder="Say something…"
        placeholderTextColor="#A78BFA"
        multiline
        editable={!saved}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {!isRecording && !saved && (
          <Pressable onPress={start} style={styles.secondaryBtn} accessibilityLabel="Resume listening" hitSlop={8}>
            <MaterialCommunityIcons name="microphone" size={26} color="#FFFFFF" />
          </Pressable>
        )}
        <Pressable
          onPress={saveAndExit}
          disabled={saved}
          style={({ pressed }) => [styles.saveBtn, isRecording && styles.saveBtnLive, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        >
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <MaterialCommunityIcons name={saved ? 'check' : isRecording ? 'stop' : 'check'} size={40} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>
      <Text style={styles.hint}>{isRecording ? 'Tap to stop and save' : 'Tap ✓ to save'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4C1D95', paddingHorizontal: 24 },
  status: { fontSize: 15, fontWeight: '600', color: '#DDD6FE', textAlign: 'center', marginBottom: 12 },
  input: {
    flex: 1, fontSize: 24, lineHeight: 34, color: '#FFFFFF',
    textAlignVertical: 'top', paddingHorizontal: 4,
  },
  error: { color: '#FECACA', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 12 },
  saveBtn: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#16A34A',
    alignItems: 'center', justifyContent: 'center', elevation: 6,
  },
  saveBtnLive: { backgroundColor: '#DC2626' },
  secondaryBtn: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { fontSize: 13, color: '#C4B5FD', textAlign: 'center', marginTop: 10 },
});
