import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Snackbar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

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
  { value: 'gemini-2.0-flash', desc: '1,500/day free — recommended' },
  { value: 'gemini-2.5-flash', desc: '500/day free — most capable' },
  { value: 'gemini-1.5-flash', desc: '1,500/day free — legacy' },
] as const;

const STT_OPTIONS: { value: STTMode; label: string; desc: string }[] = [
  { value: 'native', label: 'Native Android STT', desc: 'Fast, free, works offline' },
  { value: 'gemini-audio', label: 'Gemini Audio', desc: 'Best accuracy, needs internet' },
  { value: 'native-corrected', label: 'Native + AI correction', desc: 'Native speed + Gemini cleanup' },
];

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function RadioRow({
  label,
  desc,
  selected,
  onPress,
}: {
  label: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.radioRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <View style={styles.radioContent}>
        <Text style={[styles.radioLabel, selected && styles.radioLabelSelected]}>{label}</Text>
        <Text style={styles.radioDesc}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function SettingsScreen() {
  const { authState, userEmail, signIn, signOut } = useAuth();
  const { vaultUri, pickVault, clearVault } = useVault();
  const [indexing, setIndexing] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [snack, setSnack] = useState('');

  const [activeProvider, setActiveProviderState] = useState<LLMProvider>('gemini');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiKeySaved, setGeminiKeySaved] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqKeySaved, setGroqKeySaved] = useState(false);
  const [geminiModel, setGeminiModelState] = useState('gemini-2.0-flash');
  const [sttMode, setSttModeState] = useState<STTMode>('native');

  useEffect(() => {
    (async () => {
      const { geminiKey, groqKey, activeProvider: ap, geminiModel: gm } = await loadStoredKeys();
      if (geminiKey) { setGeminiKeyInput(geminiKey); setGeminiKeySaved(true); }
      if (groqKey) { setGroqKeyInput(groqKey); setGroqKeySaved(true); }
      setActiveProviderState(ap);
      setGeminiModelState(gm);
      const mode = await SecureStore.getItemAsync(STT_MODE_KEY);
      if (mode) setSttModeState(mode as STTMode);
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

  const changeSttMode = useCallback(async (mode: STTMode) => {
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

      {/* ── AI MODEL ── */}
      <SectionHeader title="AI MODEL" />

      <View style={styles.providerRow}>
        {(['gemini', 'groq'] as LLMProvider[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.providerTab, activeProvider === p && styles.providerTabActive]}
            onPress={() => handleSelectProvider(p)}
            activeOpacity={0.8}
          >
            <Text style={[styles.providerTabText, activeProvider === p && styles.providerTabTextActive]}>
              {p === 'gemini' ? 'Gemini' : 'Groq'}
            </Text>
            <Text style={[styles.providerTabDesc, activeProvider === p && styles.providerTabDescActive]}>
              {p === 'gemini' ? '1,500 req/day free' : '14,400 req/day free'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.keyRow}>
        <TextInput
          mode="outlined"
          label="Gemini API Key"
          value={geminiKeyInput}
          onChangeText={(t) => { setGeminiKeyInput(t); setGeminiKeySaved(false); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.keyInput}
          dense
        />
        <Button
          mode="contained"
          onPress={handleSaveGeminiKey}
          disabled={!geminiKeyInput.trim() || geminiKeySaved}
          style={styles.keyBtn}
          compact
        >
          {geminiKeySaved ? '✓' : 'Save'}
        </Button>
      </View>

      <View style={styles.keyRow}>
        <TextInput
          mode="outlined"
          label="Groq API Key"
          value={groqKeyInput}
          onChangeText={(t) => { setGroqKeyInput(t); setGroqKeySaved(false); }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.keyInput}
          dense
        />
        <Button
          mode="contained"
          onPress={handleSaveGroqKey}
          disabled={!groqKeyInput.trim() || groqKeySaved}
          style={styles.keyBtn}
          compact
        >
          {groqKeySaved ? '✓' : 'Save'}
        </Button>
      </View>

      {activeProvider === 'gemini' && (
        <View style={styles.modelSection}>
          <Text style={styles.subLabel}>Gemini model</Text>
          {GEMINI_MODELS.map((m) => (
            <RadioRow
              key={m.value}
              label={m.value}
              desc={m.desc}
              selected={geminiModel === m.value}
              onPress={() => handleSelectGeminiModel(m.value)}
            />
          ))}
        </View>
      )}

      <Divider />

      {/* ── VOICE ── */}
      <SectionHeader title="VOICE" />
      {STT_OPTIONS.map((opt) => (
        <RadioRow
          key={opt.value}
          label={opt.label}
          desc={opt.desc}
          selected={sttMode === opt.value}
          onPress={() => changeSttMode(opt.value)}
        />
      ))}

      <Divider />

      {/* ── VAULT ── */}
      <SectionHeader title="VAULT" />
      {vaultUri ? (
        <View style={styles.vaultBlock}>
          <Text style={styles.vaultUri} numberOfLines={2}>{vaultUri}</Text>
          {noteCount > 0 && <Text style={styles.vaultCount}>{noteCount} notes indexed</Text>}
          <View style={styles.vaultActions}>
            <Button
              mode="outlined"
              onPress={() => rebuildIndex(vaultUri)}
              loading={indexing}
              disabled={indexing}
              style={styles.vaultBtn}
              icon="refresh"
              compact
            >
              Re-index
            </Button>
            <Button
              mode="outlined"
              onPress={async () => { await clearVault(); await clearIndex(); setNoteCount(0); }}
              style={[styles.vaultBtn, styles.disconnectBtn]}
              icon="link-off"
              compact
            >
              Disconnect
            </Button>
          </View>
        </View>
      ) : (
        <Button mode="contained" onPress={handlePickVault} icon="folder-open" style={styles.pickBtn}>
          Pick Vault Folder
        </Button>
      )}

      <Divider />

      {/* ── ACCOUNT ── */}
      <SectionHeader title="ACCOUNT" />
      {authState === 'signed-in' ? (
        <View style={styles.accountRow}>
          <MaterialCommunityIcons name="account-circle" size={32} color="#6D28D9" />
          <View style={styles.accountInfo}>
            <Text style={styles.accountEmail}>{userEmail}</Text>
            <Text style={styles.accountDesc}>Google account</Text>
          </View>
          <Button mode="text" onPress={signOut} compact>Sign Out</Button>
        </View>
      ) : (
        <Button mode="outlined" onPress={signIn} icon="google" style={styles.signInBtn}>
          Sign in with Google
        </Button>
      )}

      <View style={styles.bottomPad} />

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3000}>
        {snack}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontWeight: 'bold', marginBottom: 20, color: '#111827' },

  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginVertical: 20 },

  // Provider toggle
  providerRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  providerTab: {
    flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB', padding: 12, alignItems: 'center',
  },
  providerTabActive: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  providerTabText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  providerTabTextActive: { color: '#FFFFFF' },
  providerTabDesc: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  providerTabDescActive: { color: '#EDE9FE' },

  // API key rows
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  keyInput: { flex: 1, backgroundColor: '#FFFFFF' },
  keyBtn: { alignSelf: 'center' },

  // Gemini model
  modelSection: { marginTop: 8 },
  subLabel: { fontSize: 12, color: '#6B7280', marginBottom: 8 },

  // Radio rows
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 12 },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleSelected: { borderColor: '#6D28D9' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6D28D9' },
  radioContent: { flex: 1 },
  radioLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  radioLabelSelected: { color: '#6D28D9' },
  radioDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },

  // Vault
  vaultBlock: { gap: 6 },
  vaultUri: { fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace' },
  vaultCount: { fontSize: 13, color: '#374151' },
  vaultActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  vaultBtn: { alignSelf: 'flex-start' },
  disconnectBtn: { borderColor: '#FCA5A5' },
  pickBtn: { alignSelf: 'flex-start' },

  // Account
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountInfo: { flex: 1 },
  accountEmail: { fontSize: 14, color: '#111827', fontWeight: '500' },
  accountDesc: { fontSize: 12, color: '#9CA3AF' },
  signInBtn: { alignSelf: 'flex-start' },

  bottomPad: { height: 20 },
});
