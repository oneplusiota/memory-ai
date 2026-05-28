import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Snackbar, Text, TextInput } from 'react-native-paper';

import { useAuth } from '@/hooks/useAuth';
import { useVault } from '@/hooks/useVault';
import { clearIndex, loadIndex, saveIndex } from '@/services/indexer/IndexStore';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { scanVaultForMarkdown } from '@/services/vault/VaultScanner';
import { parseNote } from '@/services/vault/MarkdownParser';
import { indexNote, tokenize } from '@/services/indexer/TFIDFIndexer';
import { indexLinks } from '@/services/indexer/GraphIndexer';
import { noteTitle } from '@/utils/pathUtils';
import {
  saveGeminiKey, saveGroqKey, saveActiveProvider,
  saveGeminiModelPref, loadStoredKeys,
} from '@/services/gemini/GeminiClient';
import type { LLMProvider, STTMode } from '@/types';
import * as SecureStore from 'expo-secure-store';

const STT_MODE_KEY = 'stt_mode';

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash', desc: '1,500/day free — recommended' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash', desc: '500/day free — most capable' },
  { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash', desc: '1,500/day free — legacy' },
] as const;

const STT_OPTIONS = [
  { value: 'native', label: 'Native Android STT', desc: 'Fast, free, works offline' },
  { value: 'gemini-audio', label: 'Gemini Audio', desc: 'Best accuracy, needs internet' },
  { value: 'native-corrected', label: 'Native + AI correction', desc: 'Native speed + Gemini cleanup' },
] as const;

export function SettingsScreen() {
  const { authState, userEmail, signIn, signOut } = useAuth();
  const { vaultUri, pickVault, clearVault } = useVault();
  const [indexing, setIndexing] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [snack, setSnack] = useState('');

  // Provider state
  const [activeProvider, setActiveProviderState] = useState<LLMProvider>('gemini');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiKeySaved, setGeminiKeySaved] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeySaved, setGroqKeySaved] = useState(false);
  const [geminiModel, setGeminiModelState] = useState('gemini-2.0-flash');

  // STT state
  const [sttMode, setSttModeState] = useState<string>('native');

  useEffect(() => {
    (async () => {
      const { geminiKey, groqKey, activeProvider: ap, geminiModel: gm } = await loadStoredKeys();
      if (geminiKey) { setGeminiKeyInput(geminiKey); setGeminiKeySaved(true); }
      if (groqKey) { setGroqKeyInput(groqKey); setGroqKeySaved(true); }
      setActiveProviderState(ap);
      setGeminiModelState(gm);
      const mode = await SecureStore.getItemAsync(STT_MODE_KEY);
      if (mode) setSttModeState(mode);
    })();
  }, []);

  const handleSaveGeminiKey = useCallback(async () => {
    const key = geminiKeyInput.trim();
    if (!key) return;
    await saveGeminiKey(key);
    setGeminiKeySaved(true);
    setSnack('Gemini API key saved.');
  }, [geminiKeyInput]);

  const handleSaveGroqKey = useCallback(async () => {
    const key = groqKeyInput.trim();
    if (!key) return;
    await saveGroqKey(key);
    setGroqKeySaved(true);
    setSnack('Groq API key saved.');
  }, [groqKeyInput]);

  const handleSelectProvider = useCallback(async (p: LLMProvider) => {
    setActiveProviderState(p);
    await saveActiveProvider(p);
    setSnack(`Switched to ${p === 'gemini' ? 'Gemini' : 'Groq'}.`);
  }, []);

  const handleSelectGeminiModel = useCallback(async (m: string) => {
    setGeminiModelState(m);
    await saveGeminiModelPref(m);
  }, []);

  const changeSttMode = useCallback(async (mode: string) => {
    setSttModeState(mode);
    await SecureStore.setItemAsync(STT_MODE_KEY, mode);
  }, []);

  const rebuildIndex = useCallback(async (uri: string) => {
    setIndexing(true);
    await clearIndex();
    const index = await loadIndex();
    try {
      const files = await scanVaultForMarkdown(uri);
      setNoteCount(files.length);
      for (const file of files) {
        const content = await StorageAccessFramework.readAsStringAsync(file.uri);
        const parsed = parseNote(content, noteTitle(file.relativePath));
        index.notes[file.relativePath] = {
          id: file.relativePath, title: parsed.title, tags: parsed.tags,
          aliases: parsed.aliases, summary: parsed.summary,
          outlinks: parsed.outlinks, type: parsed.type, area: parsed.area,
          status: parsed.status, lastModified: Date.now(),
        };
        indexNote(index, file.relativePath, tokenize(parsed.body));
        indexLinks(index, file.relativePath, parsed.outlinks);
      }
      index.builtAt = Date.now();
      await saveIndex(index);
      setSnack(`Indexed ${files.length} notes.`);
    } catch (e: any) {
      setSnack(`Indexing failed: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  }, []);

  const handlePickVault = useCallback(async () => {
    const uri = await pickVault();
    if (!uri) return;
    setSnack('Vault connected! Building index…');
    await rebuildIndex(uri);
  }, [pickVault, rebuildIndex]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={styles.heading}>Settings</Text>

      {/* AI Provider */}
      <Card style={styles.card}>
        <Card.Title title="AI Provider" />
        <Card.Content style={styles.cardContent}>
          <View style={styles.row}>
            <Button
              mode={activeProvider === 'gemini' ? 'contained' : 'outlined'}
              onPress={() => handleSelectProvider('gemini')}
              style={styles.providerBtn}
            >
              Gemini
            </Button>
            <Button
              mode={activeProvider === 'groq' ? 'contained' : 'outlined'}
              onPress={() => handleSelectProvider('groq')}
              style={styles.providerBtn}
            >
              Groq
            </Button>
          </View>
          <Text variant="bodySmall" style={styles.modeDesc}>
            {activeProvider === 'gemini' ? 'Google Gemini · 1,500 req/day free' : 'Groq + Llama 3.3 70B · ~14,400 req/day free'}
          </Text>
        </Card.Content>
      </Card>

      {/* Gemini Key + Model */}
      <Card style={styles.card}>
        <Card.Title title="Gemini API Key" subtitle="aistudio.google.com → Get API key" />
        <Card.Content style={styles.cardContent}>
          <TextInput
            mode="outlined"
            label="Gemini API Key"
            value={geminiKeyInput}
            onChangeText={(t) => { setGeminiKeyInput(t); setGeminiKeySaved(false); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            mode="contained"
            onPress={handleSaveGeminiKey}
            disabled={!geminiKeyInput.trim() || geminiKeySaved}
            style={styles.btn}
          >
            {geminiKeySaved ? 'Saved ✓' : 'Save Key'}
          </Button>
          <Text variant="bodySmall" style={styles.sectionLabel}>Model</Text>
          {GEMINI_MODELS.map((m) => (
            <Button
              key={m.value}
              mode={geminiModel === m.value ? 'contained' : 'outlined'}
              onPress={() => handleSelectGeminiModel(m.value)}
              style={styles.btn}
            >
              {m.label}
            </Button>
          ))}
          <Text variant="bodySmall" style={styles.modeDesc}>
            {GEMINI_MODELS.find(m => m.value === geminiModel)?.desc}
          </Text>
        </Card.Content>
      </Card>

      {/* Groq Key */}
      <Card style={styles.card}>
        <Card.Title title="Groq API Key" subtitle="console.groq.com → API Keys (free)" />
        <Card.Content style={styles.cardContent}>
          <TextInput
            mode="outlined"
            label="Groq API Key"
            value={groqKeyInput}
            onChangeText={(t) => { setGroqKeyInput(t); setGroqKeySaved(false); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            mode="contained"
            onPress={handleSaveGroqKey}
            disabled={!groqKeyInput.trim() || groqKeySaved}
            style={styles.btn}
          >
            {groqKeySaved ? 'Saved ✓' : 'Save Key'}
          </Button>
          <Text variant="bodySmall" style={styles.modeDesc}>llama-3.3-70b-versatile · ~14,400 req/day free</Text>
        </Card.Content>
      </Card>

      {/* Voice Transcription */}
      <Card style={styles.card}>
        <Card.Title title="Voice Transcription" />
        <Card.Content style={styles.cardContent}>
          {STT_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              mode={sttMode === opt.value ? 'contained' : 'outlined'}
              onPress={() => changeSttMode(opt.value)}
              style={styles.btn}
            >
              {opt.label}
            </Button>
          ))}
          <Text variant="bodySmall" style={styles.modeDesc}>
            {STT_OPTIONS.find((o) => o.value === sttMode)?.desc ?? ''}
          </Text>
        </Card.Content>
      </Card>

      {/* Google Account */}
      <Card style={styles.card}>
        <Card.Title title="Google Account" subtitle="Used for identity only" />
        <Card.Content style={styles.cardContent}>
          {authState === 'signed-in' ? (
            <>
              <Text variant="bodyMedium">{userEmail}</Text>
              <Button mode="outlined" onPress={signOut} style={styles.btn}>Sign Out</Button>
            </>
          ) : (
            <Button mode="contained" onPress={signIn} icon="google" style={styles.btn}>
              Sign in with Google
            </Button>
          )}
        </Card.Content>
      </Card>

      {/* Obsidian Vault */}
      <Card style={styles.card}>
        <Card.Title title="Obsidian Vault" />
        <Card.Content style={styles.cardContent}>
          {vaultUri ? (
            <>
              <Text variant="bodySmall" style={styles.uri} numberOfLines={2}>{vaultUri}</Text>
              {noteCount > 0 && <Text variant="bodySmall">{noteCount} notes indexed</Text>}
              <View style={styles.row}>
                <Button mode="outlined" onPress={() => rebuildIndex(vaultUri)} loading={indexing} disabled={indexing} style={styles.btn}>
                  Re-index
                </Button>
                <Button mode="outlined" onPress={async () => { await clearVault(); await clearIndex(); setNoteCount(0); }} style={styles.btn}>
                  Disconnect
                </Button>
              </View>
            </>
          ) : (
            <Button mode="contained" onPress={handlePickVault} icon="folder-open" style={styles.btn}>
              Pick Vault Folder
            </Button>
          )}
        </Card.Content>
      </Card>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3000}>
        {snack}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingTop: 60 },
  heading: { fontWeight: 'bold', marginBottom: 8 },
  card: { borderRadius: 12 },
  cardContent: { gap: 10, paddingBottom: 16 },
  btn: { alignSelf: 'flex-start' },
  providerBtn: { flex: 1 },
  sectionLabel: { color: '#6B7280', marginTop: 4 },
  modeDesc: { color: '#9CA3AF', marginTop: 2 },
  uri: { color: '#888', fontFamily: 'monospace' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
