import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Snackbar, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { RecordButton } from '@/components/RecordButton';
import { TranscriptDisplay } from '@/components/TranscriptDisplay';
import { useVoice } from '@/hooks/useVoice';
import { useGemini } from '@/hooks/useGemini';
import { useVault } from '@/hooks/useVault';
import { appendToDailyNote, appendToNote, createNote } from '@/services/vault/VaultWriter';
import { getIndex, saveIndex } from '@/services/indexer/IndexStore';
import { indexNote, tokenize } from '@/services/indexer/TFIDFIndexer';
import { indexLinks } from '@/services/indexer/GraphIndexer';
import { parseNote } from '@/services/vault/MarkdownParser';
import { noteTitle } from '@/utils/pathUtils';
import type { RootStackParamList } from '@/navigation/AppNavigator';
import type { RoutingDecision } from '@/types';

type Nav = StackNavigationProp<RootStackParamList, 'Conversation'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { vaultUri } = useVault();
  const { geminiState, error: geminiError, route, reset: resetGemini } = useGemini();
  const [snack, setSnack] = useState('');

  // Controlled transcript — HomeScreen owns this, STT appends to it
  const [transcript, setTranscript] = useState('');
  // baseRef = the "clean" base: updated by user edits AND by final STT commits.
  // onChangeText only fires on user input (not programmatic setTranscript), so
  // editing the field updates baseRef, and the next partial appends to the edited text.
  const baseRef = useRef('');

  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

  const handleTranscriptChange = useCallback((text: string) => {
    baseRef.current = normalize(text);
    setTranscript(text); // preserve cursor position — don't normalize user's own input in-place
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

  const { state: voiceState, error: voiceError, startListening, stopListening, reset: resetVoice } = useVoice(handleAppend, handleFinalAppend);

  const reindexNote = useCallback(async (vault: string, relativePath: string, content: string) => {
    const index = getIndex();
    const parsed = parseNote(content, noteTitle(relativePath));
    index.notes[relativePath] = {
      id: relativePath,
      title: parsed.title,
      tags: parsed.tags,
      aliases: parsed.aliases,
      summary: parsed.summary,
      outlinks: parsed.outlinks,
      lastModified: Date.now(),
    };
    indexNote(index, relativePath, tokenize(parsed.body));
    indexLinks(index, relativePath, parsed.outlinks);
    await saveIndex(index);
  }, []);

  const executeDecision = useCallback(async (dec: RoutingDecision, vault: string) => {
    try {
      // Always write to daily note
      const dailyPath = await appendToDailyNote(vault, dec.daily_entry);
      await reindexNote(vault, dailyPath, dec.daily_entry);

      // Conditionally write to atom
      if (dec.action === 'update_atom' && dec.target_note && dec.atom_content) {
        await appendToNote(vault, dec.target_note, dec.atom_content);
        await reindexNote(vault, dec.target_note, dec.atom_content);
      } else if (dec.action === 'create_atom' && dec.target_note && dec.atom_content) {
        await createNote(vault, dec.target_note, dec.atom_content);
        await reindexNote(vault, dec.target_note, dec.atom_content);
      }

      const label = dec.action === 'log_only'
        ? 'Logged to daily note'
        : `Saved to ${noteTitle(dec.target_note)}`;
      setSnack(label);
      resetVoice();
      resetGemini();
      baseRef.current = '';
      setTranscript('');
    } catch (e: any) {
      setSnack(`Write failed: ${e?.message ?? String(e)}`);
    }
  }, [reindexNote, resetVoice, resetGemini]);

  const handleTranscriptReady = useCallback(async (text: string) => {
    if (!vaultUri) {
      setSnack('No vault selected. Go to Settings.');
      return;
    }
    const dec = await route(text);
    if (!dec) return;

    if (dec.confidence === 'medium') {
      navigation.navigate('Confirm', { decision: dec, vaultUri });
      return;
    }
    await executeDecision(dec, vaultUri);
  }, [vaultUri, route, navigation, executeDecision]);

  // Auto-fire when recording stops — use baseRef (reflects user edits + committed STT)
  useEffect(() => {
    if (voiceState === 'done' && baseRef.current.trim()) {
      handleTranscriptReady(baseRef.current.trim());
    }
  }, [voiceState, handleTranscriptReady]);

  const handleReset = useCallback(() => {
    resetVoice();
    resetGemini();
    baseRef.current = '';
    setTranscript('');
  }, [resetVoice, resetGemini]);

  const isProcessing = geminiState === 'searching' || geminiState === 'calling';

  const statusLabel = isProcessing
    ? (geminiState === 'searching' ? 'Searching notes…' : 'Asking Gemini…')
    : voiceState === 'listening' ? 'Listening…'
    : voiceState === 'done' ? 'Processing…'
    : 'Ready';

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>memory.ai</Text>

      <TranscriptDisplay
        value={transcript}
        onChangeText={handleTranscriptChange}
        status={statusLabel}
        statusColor={voiceState === 'listening' ? '#B00020' : '#555'}
        editable={!isProcessing}
      />

      <View style={styles.buttonArea}>
        <RecordButton
          isListening={voiceState === 'listening'}
          disabled={isProcessing}
          onPress={voiceState === 'listening' ? stopListening : startListening}
        />
        {(transcript.length > 0 || voiceState !== 'idle' || geminiState !== 'idle') && (
          <Button onPress={handleReset} style={styles.resetBtn}>Reset</Button>
        )}
      </View>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack('')}
        duration={3000}
        action={{ label: 'OK', onPress: () => setSnack('') }}
      >
        {snack}
      </Snackbar>

      {(voiceError || geminiError) && (
        <Snackbar visible onDismiss={() => {}} duration={4000}>
          {voiceError ?? geminiError}
        </Snackbar>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingBottom: 40, alignItems: 'center', gap: 24, backgroundColor: '#FAFAFA' },
  title: { fontWeight: 'bold', color: '#6200EE' },
  buttonArea: { alignItems: 'center', gap: 16 },
  resetBtn: { marginTop: 8 },
});
