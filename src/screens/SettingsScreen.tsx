import React, { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
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
  saveGeminiKey, saveGroqKey, saveClaudeKey, saveActiveProvider,
  saveGeminiModelPref, saveGroqModelPref, saveClaudeModelPref, loadStoredKeys,
} from '@/services/gemini/GeminiClient';
import {
  saveWebSearchProvider, saveTavilyKey, saveSerperKey,
  loadStoredWebSearchKeys,
} from '@/services/tools/WebSearchClient';
import type { AgentMode, LLMProvider, STTMode, WebSearchProvider } from '@/types';
import * as SecureStore from 'expo-secure-store';

const AGENT_MODE_KEY = 'agent_mode';

const STT_MODE_KEY = 'stt_mode';

const GEMINI_MODELS = [
  // ── Free tier ──
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: '1,500/day free · recommended' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: '500/day free · most capable free' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: '1,500/day free · legacy' },
  // ── Paid ──
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro ★', desc: 'Paid · best reasoning & coding' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro ★', desc: 'Paid · 1M context window' },
  { value: 'gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking ★', desc: 'Paid · extended thinking' },
];

const GROQ_MODELS = [
  // ── Free tier ──
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', desc: 'Best quality · recommended' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', desc: 'Fastest · low latency' },
  { value: 'llama3-70b-8192', label: 'Llama 3 70B', desc: 'High quality · 8k context' },
  { value: 'llama3-8b-8192', label: 'Llama 3 8B', desc: 'Fast · 8k context' },
  { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', desc: 'Long context · 32k tokens' },
  { value: 'gemma2-9b-it', label: 'Gemma 2 9B', desc: 'Google · instruction-tuned' },
  // ── Paid tier ──
  { value: 'llama-3.3-70b-specdec', label: 'Llama 3.3 70B SpecDec ★', desc: 'Paid · speculative decoding, faster' },
  { value: 'llama-3.2-90b-vision-preview', label: 'Llama 3.2 90B Vision ★', desc: 'Paid · multimodal, largest Llama' },
  { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B ★', desc: 'Paid · chain-of-thought reasoning' },
  { value: 'qwen-qwq-32b', label: 'Qwen QwQ 32B ★', desc: 'Paid · strong reasoning model' },
  { value: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 ★', desc: 'Paid · agentic & tool use' },
];

const CLAUDE_MODELS = [
  // ── Claude 4.x ──
  { value: 'claude-haiku-3-5', label: 'Claude Haiku 3.5', desc: 'Cheapest · fastest response' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', desc: 'Balanced · recommended' },
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5 ★', desc: 'Most capable 4.5 · highest cost' },
  // ── Claude 4 stable ──
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 ★', desc: 'Latest stable Sonnet 4' },
  { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 ★', desc: 'Latest stable Opus 4 · top quality' },
  // ── Claude 3.x (lower cost) ──
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', desc: 'Previous gen · widely available' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', desc: 'Previous gen · very fast & cheap' },
  { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet ★', desc: 'Extended thinking support' },
];

const STT_OPTIONS: { value: STTMode; label: string; desc: string }[] = [
  { value: 'native', label: 'Native Android STT', desc: 'Fast, free, works offline' },
  { value: 'gemini-audio', label: 'Gemini Audio', desc: 'Best accuracy, needs internet' },
  { value: 'native-corrected', label: 'Native + AI correction', desc: 'Native speed + AI cleanup' },
];

const LLM_PROVIDERS: { value: LLMProvider; label: string; desc: string }[] = [
  { value: 'gemini', label: 'Gemini', desc: '1,500 req/day free' },
  { value: 'groq', label: 'Groq', desc: '14,400 req/day free' },
  { value: 'claude', label: 'Claude', desc: 'Anthropic · pay-per-use' },
];

const WEB_SEARCH_PROVIDERS: { value: WebSearchProvider; label: string; desc: string }[] = [
  { value: 'tavily', label: 'Tavily', desc: '1,000 searches/mo free · best for AI' },
  { value: 'serper', label: 'Serper (Google)', desc: '2,500 queries/mo free · real Google results' },
];

const AGENT_MODES: { value: AgentMode; label: string; desc: string }[] = [
  { value: 'agentic', label: 'Agentic loop', desc: 'AI calls tools in sequence until done' },
  { value: 'single', label: 'Single call', desc: 'One round of tool calls, then stops' },
];

// ── Reusable UI components ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function Divider() {
  return <View style={styles.divider} />;
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.settingRow} onPress={onPress} activeOpacity={0.65}>
      <View style={[styles.settingIconWrap, danger && styles.settingIconWrapDanger]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={danger ? '#EF4444' : '#6D28D9'} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
        {value ? <Text style={styles.settingValue} numberOfLines={1}>{value}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={18} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

function PickerModal<T extends string>({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string; desc: string }[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>{title}</Text>
        {options.map((opt) => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={styles.optionRow}
              onPress={() => { onSelect(opt.value); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{opt.label}</Text>
                <Text style={styles.optionDesc}>{opt.desc}</Text>
              </View>
              {active && <MaterialCommunityIcons name="check-circle" size={20} color="#6D28D9" />}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function KeyModal({
  visible, title, placeholder, value, onChange, onSave, onClose,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChange: (t: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>{title}</Text>
        <TextInput
          mode="outlined"
          label={placeholder}
          value={value}
          onChangeText={onChange}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.keyModalInput}
          dense
        />
        <View style={styles.keyModalActions}>
          <Button mode="text" onPress={onClose} style={styles.keyModalBtn}>Cancel</Button>
          <Button mode="contained" onPress={() => { onSave(); onClose(); }} style={styles.keyModalBtn}>Save</Button>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsScreen() {
  const { authState, userEmail, signIn, signOut } = useAuth();
  const { vaultUri, pickVault, clearVault } = useVault();
  const [indexing, setIndexing] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [snack, setSnack] = useState('');

  // LLM state
  const [activeProvider, setActiveProviderState] = useState<LLMProvider>('gemini');
  const [geminiKey, setGeminiKeyState] = useState('');
  const [groqKey, setGroqKeyState] = useState('');
  const [claudeKey, setClaudeKeyState] = useState('');
  const [geminiModel, setGeminiModelState] = useState('gemini-2.0-flash');
  const [groqModel, setGroqModelState] = useState('llama-3.3-70b-versatile');
  const [claudeModel, setClaudeModelState] = useState('claude-sonnet-4-5');

  // Web search state
  const [webSearchProvider, setWebSearchProviderState] = useState<WebSearchProvider>('tavily');
  const [tavilyKey, setTavilyKeyState] = useState('');
  const [serperKey, setSerperKeyState] = useState('');

  // Agent / STT state
  const [agentMode, setAgentModeState] = useState<AgentMode>('agentic');
  const [sttMode, setSttModeState] = useState<STTMode>('native');

  // Modal state — one open at a time
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');

  useEffect(() => {
    (async () => {
      const stored = await loadStoredKeys();
      if (stored.geminiKey) setGeminiKeyState(stored.geminiKey);
      if (stored.groqKey) setGroqKeyState(stored.groqKey);
      if (stored.claudeKey) setClaudeKeyState(stored.claudeKey);
      setActiveProviderState(stored.activeProvider);
      setGeminiModelState(stored.geminiModel);
      setGroqModelState(stored.groqModel);
      setClaudeModelState(stored.claudeModel);

      const { tavilyKey: tk, serperKey: sk, provider: wsp } = await loadStoredWebSearchKeys();
      if (tk) setTavilyKeyState(tk);
      if (sk) setSerperKeyState(sk);
      setWebSearchProviderState(wsp);

      const am = await SecureStore.getItemAsync(AGENT_MODE_KEY);
      if (am) setAgentModeState(am as AgentMode);
      const sm = await SecureStore.getItemAsync(STT_MODE_KEY);
      if (sm) setSttModeState(sm as STTMode);
    })();
  }, []);

  const handleSelectProvider = useCallback(async (p: LLMProvider) => {
    setActiveProviderState(p);
    await saveActiveProvider(p);
    const label = LLM_PROVIDERS.find(x => x.value === p)?.label ?? p;
    setSnack(`Switched to ${label}.`);
  }, []);

  const handleSelectGeminiModel = useCallback(async (m: string) => {
    setGeminiModelState(m);
    await saveGeminiModelPref(m);
    setSnack('Gemini model updated.');
  }, []);

  const handleSelectGroqModel = useCallback(async (m: string) => {
    setGroqModelState(m);
    await saveGroqModelPref(m);
    setSnack('Groq model updated.');
  }, []);

  const handleSaveGeminiKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveGeminiKey(key);
    setGeminiKeyState(key);
    setSnack('Gemini API key saved.');
  }, [keyDraft]);

  const handleSaveGroqKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveGroqKey(key);
    setGroqKeyState(key);
    setSnack('Groq API key saved.');
  }, [keyDraft]);

  const handleSaveClaudeKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveClaudeKey(key);
    setClaudeKeyState(key);
    setSnack('Claude API key saved.');
  }, [keyDraft]);

  const handleSelectClaudeModel = useCallback(async (m: string) => {
    setClaudeModelState(m);
    await saveClaudeModelPref(m);
    setSnack('Claude model updated.');
  }, []);

  const handleSaveTavilyKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveTavilyKey(key);
    setTavilyKeyState(key);
    setSnack('Tavily API key saved.');
  }, [keyDraft]);

  const handleSaveSerperKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveSerperKey(key);
    setSerperKeyState(key);
    setSnack('Serper API key saved.');
  }, [keyDraft]);

  const handleSelectWebSearch = useCallback(async (p: WebSearchProvider) => {
    setWebSearchProviderState(p);
    await saveWebSearchProvider(p);
    const label = WEB_SEARCH_PROVIDERS.find(x => x.value === p)?.label ?? p;
    setSnack(`Web search set to ${label}.`);
  }, []);

  const handleSelectAgentMode = useCallback(async (m: AgentMode) => {
    setAgentModeState(m);
    await SecureStore.setItemAsync(AGENT_MODE_KEY, m);
  }, []);

  const handleSelectSttMode = useCallback(async (m: STTMode) => {
    setSttModeState(m);
    await SecureStore.setItemAsync(STT_MODE_KEY, m);
  }, []);

  const openKeyModal = (id: string, currentValue: string) => {
    setKeyDraft(currentValue);
    setOpenModal(id);
  };

  const maskKey = (k: string) => k ? `••••••••${k.slice(-4)}` : 'Not set';
  const geminiModelLabel = GEMINI_MODELS.find(m => m.value === geminiModel)?.label ?? geminiModel;
  const groqModelLabel = GROQ_MODELS.find(m => m.value === groqModel)?.label ?? groqModel;
  const claudeModelLabel = CLAUDE_MODELS.find(m => m.value === claudeModel)?.label ?? claudeModel;
  const webSearchLabel = WEB_SEARCH_PROVIDERS.find(p => p.value === webSearchProvider)?.label ?? webSearchProvider;
  const agentModeLabel = AGENT_MODES.find(m => m.value === agentMode)?.label ?? agentMode;
  const sttLabel = STT_OPTIONS.find(m => m.value === sttMode)?.label ?? sttMode;
  const providerLabel = LLM_PROVIDERS.find(p => p.value === activeProvider)?.label ?? activeProvider;

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
    try {
      const uri = await pickVault();
      if (!uri) return;           // dismissed — do nothing silently
      setSnack('Vault connected! Building index…');
      await rebuildIndex(uri);
    } catch (e: any) {
      setSnack(`Could not open vault: ${e?.message ?? 'Unknown error'}`);
    }
  }, [pickVault, rebuildIndex]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text variant="headlineSmall" style={styles.heading}>Settings</Text>

        {/* ── AI MODEL ── */}
        <SectionHeader title="AI MODEL" />
        <View style={styles.card}>
          <SettingRow
            icon="swap-horizontal"
            label="Provider"
            value={providerLabel}
            onPress={() => setOpenModal('provider')}
          />
          <View style={styles.cardDivider} />
          {activeProvider === 'gemini' ? (
            <>
              <SettingRow
                icon="key-outline"
                label="Gemini API Key"
                value={maskKey(geminiKey)}
                onPress={() => openKeyModal('gemini_key', geminiKey)}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="chip"
                label="Gemini Model"
                value={geminiModelLabel}
                onPress={() => setOpenModal('gemini_model')}
              />
            </>
          ) : activeProvider === 'groq' ? (
            <>
              <SettingRow
                icon="key-outline"
                label="Groq API Key"
                value={maskKey(groqKey)}
                onPress={() => openKeyModal('groq_key', groqKey)}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="chip"
                label="Groq Model"
                value={groqModelLabel}
                onPress={() => setOpenModal('groq_model')}
              />
            </>
          ) : (
            <>
              <SettingRow
                icon="key-outline"
                label="Claude API Key"
                value={maskKey(claudeKey)}
                onPress={() => openKeyModal('claude_key', claudeKey)}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="chip"
                label="Claude Model"
                value={claudeModelLabel}
                onPress={() => setOpenModal('claude_model')}
              />
            </>
          )}
        </View>

        <Divider />

        {/* ── WEB SEARCH ── */}
        <SectionHeader title="WEB SEARCH" />
        <View style={styles.card}>
          <SettingRow
            icon="magnify"
            label="Search Provider"
            value={webSearchLabel}
            onPress={() => setOpenModal('web_search_provider')}
          />
          <View style={styles.cardDivider} />
          {webSearchProvider === 'tavily' ? (
            <SettingRow
              icon="key-outline"
              label="Tavily API Key"
              value={maskKey(tavilyKey)}
              onPress={() => openKeyModal('tavily_key', tavilyKey)}
            />
          ) : (
            <SettingRow
              icon="key-outline"
              label="Serper API Key"
              value={maskKey(serperKey)}
              onPress={() => openKeyModal('serper_key', serperKey)}
            />
          )}
        </View>

        <Divider />

        {/* ── AGENT MODE ── */}
        <SectionHeader title="AGENT MODE" />
        <View style={styles.card}>
          <SettingRow
            icon="robot-outline"
            label="Execution Mode"
            value={agentModeLabel}
            onPress={() => setOpenModal('agent_mode')}
          />
        </View>

        <Divider />

        {/* ── VOICE ── */}
        <SectionHeader title="VOICE" />
        <View style={styles.card}>
          <SettingRow
            icon="microphone-outline"
            label="Speech-to-Text Mode"
            value={sttLabel}
            onPress={() => setOpenModal('stt_mode')}
          />
        </View>

        <Divider />

        {/* ── VAULT ── */}
        <SectionHeader title="VAULT" />
        <View style={styles.card}>
          <SettingRow
            icon="folder-outline"
            label="Vault"
            value={vaultUri ? (noteCount > 0 ? `${noteCount} notes indexed` : 'Connected') : 'Not connected'}
            onPress={() => setOpenModal('vault')}
          />
        </View>

        <Divider />

        {/* ── ACCOUNT ── */}
        <SectionHeader title="ACCOUNT" />
        <View style={styles.card}>
          {authState === 'signed-in' ? (
            <>
              <View style={styles.accountRow}>
                <View style={styles.settingIconWrap}>
                  <MaterialCommunityIcons name="account-circle-outline" size={18} color="#6D28D9" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingLabel}>{userEmail}</Text>
                  <Text style={styles.settingValue}>Google account · signed in</Text>
                </View>
              </View>
              <View style={styles.cardDivider} />
              <SettingRow icon="logout" label="Sign Out" danger onPress={signOut} />
            </>
          ) : (
            <SettingRow icon="google" label="Sign in with Google" onPress={signIn} />
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── Picker modals ── */}
      <PickerModal
        visible={openModal === 'provider'}
        title="AI Provider"
        options={LLM_PROVIDERS}
        selected={activeProvider}
        onSelect={handleSelectProvider}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'gemini_model'}
        title="Gemini Model"
        options={GEMINI_MODELS}
        selected={geminiModel}
        onSelect={handleSelectGeminiModel}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'groq_model'}
        title="Groq Model"
        options={GROQ_MODELS}
        selected={groqModel}
        onSelect={handleSelectGroqModel}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'claude_model'}
        title="Claude Model"
        options={CLAUDE_MODELS}
        selected={claudeModel}
        onSelect={handleSelectClaudeModel}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'web_search_provider'}
        title="Web Search Provider"
        options={WEB_SEARCH_PROVIDERS}
        selected={webSearchProvider}
        onSelect={handleSelectWebSearch}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'agent_mode'}
        title="Agent Execution Mode"
        options={AGENT_MODES}
        selected={agentMode}
        onSelect={handleSelectAgentMode}
        onClose={() => setOpenModal(null)}
      />
      <PickerModal
        visible={openModal === 'stt_mode'}
        title="Speech-to-Text Mode"
        options={STT_OPTIONS}
        selected={sttMode}
        onSelect={handleSelectSttMode}
        onClose={() => setOpenModal(null)}
      />

      {/* ── Key entry modals ── */}
      <KeyModal
        visible={openModal === 'gemini_key'}
        title="Gemini API Key"
        placeholder="AIza..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveGeminiKey}
        onClose={() => setOpenModal(null)}
      />
      <KeyModal
        visible={openModal === 'groq_key'}
        title="Groq API Key"
        placeholder="gsk_..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveGroqKey}
        onClose={() => setOpenModal(null)}
      />
      <KeyModal
        visible={openModal === 'claude_key'}
        title="Claude API Key"
        placeholder="sk-ant-..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveClaudeKey}
        onClose={() => setOpenModal(null)}
      />
      <KeyModal
        visible={openModal === 'tavily_key'}
        title="Tavily API Key"
        placeholder="tvly-..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveTavilyKey}
        onClose={() => setOpenModal(null)}
      />
      <KeyModal
        visible={openModal === 'serper_key'}
        title="Serper API Key"
        placeholder="Get yours free at serper.dev"
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveSerperKey}
        onClose={() => setOpenModal(null)}
      />

      {/* ── Vault modal ── */}
      <Modal visible={openModal === 'vault'} transparent animationType="slide" onRequestClose={() => setOpenModal(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setOpenModal(null)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Vault</Text>

          {vaultUri ? (
            <>
              {/* Re-index */}
              <TouchableOpacity
                style={styles.vaultActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  setOpenModal(null);
                  rebuildIndex(vaultUri);
                }}
              >
                <View style={styles.vaultActionIcon}>
                  <MaterialCommunityIcons name="folder-refresh-outline" size={20} color="#6D28D9" />
                </View>
                <View style={styles.vaultActionText}>
                  <Text style={styles.vaultActionLabel}>Re-index Vault</Text>
                  <Text style={styles.vaultActionDesc}>
                    {indexing ? 'Indexing…' : noteCount > 0 ? `${noteCount} notes currently indexed` : 'Scan vault and rebuild index'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.vaultActionDivider} />

              {/* Connect new */}
              <TouchableOpacity
                style={styles.vaultActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  setOpenModal(null);
                  handlePickVault();
                }}
              >
                <View style={styles.vaultActionIcon}>
                  <MaterialCommunityIcons name="folder-open-outline" size={20} color="#6D28D9" />
                </View>
                <View style={styles.vaultActionText}>
                  <Text style={styles.vaultActionLabel}>Change Vault Folder</Text>
                  <Text style={styles.vaultActionDesc}>Pick a different folder</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.vaultActionDivider} />

              {/* Disconnect */}
              <TouchableOpacity
                style={styles.vaultActionRow}
                activeOpacity={0.7}
                onPress={async () => {
                  setOpenModal(null);
                  await clearVault();
                  await clearIndex();
                  setNoteCount(0);
                  setSnack('Vault disconnected.');
                }}
              >
                <View style={[styles.vaultActionIcon, styles.vaultActionIconDanger]}>
                  <MaterialCommunityIcons name="link-off" size={20} color="#EF4444" />
                </View>
                <View style={styles.vaultActionText}>
                  <Text style={[styles.vaultActionLabel, styles.vaultActionLabelDanger]}>Disconnect Vault</Text>
                  <Text style={styles.vaultActionDesc}>Remove vault connection</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.vaultActionRow}
              activeOpacity={0.7}
              onPress={() => {
                setOpenModal(null);
                handlePickVault();
              }}
            >
              <View style={styles.vaultActionIcon}>
                <MaterialCommunityIcons name="folder-open-outline" size={20} color="#6D28D9" />
              </View>
              <View style={styles.vaultActionText}>
                <Text style={styles.vaultActionLabel}>Connect Vault Folder</Text>
                <Text style={styles.vaultActionDesc}>Pick your Obsidian vault folder</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.modalCancel} onPress={() => setOpenModal(null)}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3000}>
        {snack}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  container: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },
  heading: { fontWeight: 'bold', marginBottom: 20, color: '#111827' },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    color: '#6B7280', textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4, paddingLeft: 4,
  },
  divider: { height: 20 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6', marginLeft: 54 },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  settingIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  settingIconWrapDanger: { backgroundColor: '#FEE2E2' },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, color: '#111827', fontWeight: '500' },
  settingLabelDanger: { color: '#EF4444' },
  settingValue: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },

  accountRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },

  bottomPad: { height: 20 },

  // Modal
  modalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 16,
  },
  modalHandle: {
    alignSelf: 'center', width: 36, height: 4,
    borderRadius: 2, backgroundColor: '#D1D5DB', marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 16 },

  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 15, color: '#374151', fontWeight: '500' },
  optionLabelActive: { color: '#6D28D9' },
  optionDesc: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },

  modalCancel: {
    marginTop: 12, alignItems: 'center', paddingVertical: 12,
    borderRadius: 10, backgroundColor: '#F3F4F6',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },

  keyModalInput: { backgroundColor: '#FFFFFF', marginBottom: 16 },
  keyModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  keyModalBtn: { minWidth: 80 },

  // Vault modal action rows
  vaultActionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  vaultActionDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6' },
  vaultActionIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  vaultActionIconDanger: { backgroundColor: '#FEE2E2' },
  vaultActionText: { flex: 1 },
  vaultActionLabel: { fontSize: 15, fontWeight: '500', color: '#111827' },
  vaultActionLabelDanger: { color: '#EF4444' },
  vaultActionDesc: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
});
