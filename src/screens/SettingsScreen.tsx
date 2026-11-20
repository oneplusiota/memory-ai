import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Snackbar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useVault } from '@/hooks/useVault';
import { clearNotes, getAllNotes, getNoteCount, upsertNote, upsertLinks, setEmbedding } from '@/services/db/VaultDB';
import {
  isModelDownloaded as gloveModelDownloaded,
  downloadModel as gloveDownloadModel,
  loadVocab as gloveLoadVocab,
  isReady as gloveReady,
  embed as gloveEmbed,
  deleteModel as gloveDeleteModel,
} from '@/services/search/GloveService';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { scanVaultForMarkdown } from '@/services/vault/VaultScanner';
import { parseNote } from '@/services/vault/MarkdownParser';
import { extractDensestParagraph } from '@/utils/textUtils';
import { noteTitle } from '@/utils/pathUtils';
import {
  saveGeminiKey, saveGroqKey, saveClaudeKey, saveOpenRouterKey, saveActiveProvider,
  saveGeminiModelPref, saveGroqModelPref, saveClaudeModelPref, saveOpenRouterModelPref, loadStoredKeys,
} from '@/services/llm/ProviderConfig';
import {
  saveWebSearchProvider, saveTavilyKey, saveSerperKey,
  loadStoredWebSearchKeys,
} from '@/services/tools/WebSearchClient';
import type { AgentMode, LLMProvider, WebSearchProvider } from '@/types';
import * as SecureStore from 'expo-secure-store';

const AGENT_MODE_KEY = 'agent_mode';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Free tier · recommended' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', desc: 'Free tier · fastest, highest limits' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', desc: 'Newest · limits vary' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro ★', desc: 'Paid · best reasoning' },
];

const GROQ_MODELS = [
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', desc: 'Free · recommended' },
  { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', desc: 'Free · strong reasoning & tool use' },
  { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', desc: 'Free · fast' },
  { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', desc: 'Free · long context' },
  { value: 'qwen/qwen3-32b', label: 'Qwen3 32B', desc: 'Free · reasoning' },
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', desc: 'Free · lowest latency' },
  { value: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 ★', desc: 'Paid · agentic & tool use' },
];

const CLAUDE_MODELS = [
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', desc: 'Cheapest · fastest response' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', desc: 'Balanced · recommended' },
  { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 ★', desc: 'Most capable · highest cost' },
];

// Free OpenRouter models that support tool calling. The free catalogue rotates often, so
// "openrouter/free" (auto-picks an available free model) is the default and any other
// model id can be typed in via "Custom model…".
const OPENROUTER_CUSTOM = '__custom__';
const OPENROUTER_MODELS = [
  { value: 'openrouter/free', label: 'Free Models Router', desc: 'Auto-picks an available free model · recommended' },
  { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra', desc: 'Free · largest · 1M context' },
  { value: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', desc: 'Free · 262k context' },
  { value: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B A4B', desc: 'Free · fast · 262k context' },
  { value: 'inclusionai/ling-3.2-flash:free', label: 'Ling 3.2 Flash', desc: 'Free · 1M context' },
  { value: OPENROUTER_CUSTOM, label: 'Custom model…', desc: 'Enter any OpenRouter model id' },
];

const LLM_PROVIDERS: { value: LLMProvider; label: string; desc: string }[] = [
  { value: 'openrouter', label: 'OpenRouter', desc: 'Free models · one key' },
  { value: 'gemini', label: 'Gemini', desc: 'Google AI Studio · free tier' },
  { value: 'groq', label: 'Groq', desc: 'Fast · free tier' },
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
  visible, title, placeholder, value, onChange, onSave, onClose, secure = true,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  secure?: boolean;
  value: string;
  onChange: (t: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(keyboardHeight, { toValue: e.endCoordinates.height, duration: 150, useNativeDriver: false }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [keyboardHeight]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.keyModalAvoid}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.keyModalSheet, { marginBottom: keyboardHeight }]}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            mode="outlined"
            label={placeholder}
            value={value}
            onChangeText={onChange}
            secureTextEntry={secure}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.keyModalInput}
            dense
            autoFocus
            onBlur={() => Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start()}
          />
          <View style={styles.keyModalActions}>
            <Button mode="text" onPress={onClose} style={styles.keyModalBtn}>Cancel</Button>
            <Button mode="contained" onPress={() => { onSave(); onClose(); }} style={styles.keyModalBtn}>Save</Button>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function SettingsScreen() {
  const { vaultUri, pickVault, clearVault } = useVault();
  const [indexing, setIndexing] = useState(false);
  const [noteCount, setNoteCount] = useState(0);
  const [snack, setSnack] = useState('');

  // GloVe semantic search state
  const [gloveDownloaded, setGloveDownloaded] = useState(false);
  const [gloveLoaded, setGloveLoaded] = useState(false);
  const [gloveDownloading, setGloveDownloading] = useState(false);
  const [gloveDownloadProgress, setGloveDownloadProgress] = useState(0);
  const [embeddedCount, setEmbeddedCount] = useState(0);

  // LLM state
  const [activeProvider, setActiveProviderState] = useState<LLMProvider>('openrouter');
  const [geminiKey, setGeminiKeyState] = useState('');
  const [groqKey, setGroqKeyState] = useState('');
  const [claudeKey, setClaudeKeyState] = useState('');
  const [openrouterKey, setOpenRouterKeyState] = useState('');
  const [openrouterModel, setOpenRouterModelState] = useState('openrouter/free');
  const [geminiModel, setGeminiModelState] = useState('gemini-2.5-flash');
  const [groqModel, setGroqModelState] = useState('llama-3.3-70b-versatile');
  const [claudeModel, setClaudeModelState] = useState('claude-sonnet-4-6');

  // Web search state
  const [webSearchProvider, setWebSearchProviderState] = useState<WebSearchProvider>('tavily');
  const [tavilyKey, setTavilyKeyState] = useState('');
  const [serperKey, setSerperKeyState] = useState('');

  // Agent / STT state
  const [agentMode, setAgentModeState] = useState<AgentMode>('agentic');

  // Modal state — one open at a time
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');

  useEffect(() => {
    (async () => {
      const stored = await loadStoredKeys();
      if (stored.geminiKey) setGeminiKeyState(stored.geminiKey);
      if (stored.groqKey) setGroqKeyState(stored.groqKey);
      if (stored.claudeKey) setClaudeKeyState(stored.claudeKey);
      if (stored.openrouterKey) setOpenRouterKeyState(stored.openrouterKey);
      setOpenRouterModelState(stored.openrouterModel);
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

      // Load note count from SQLite
      const count = await getNoteCount();
      setNoteCount(count);

      // Count notes with embeddings
      const allNotes = await getAllNotes();
      setEmbeddedCount(allNotes.filter(n => n.embedding && n.embedding.length > 0).length);

      // Check GloVe model state
      const downloaded = await gloveModelDownloaded();
      setGloveDownloaded(downloaded);
      if (downloaded) {
        gloveLoadVocab().then(() => setGloveLoaded(gloveReady()));
      }
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

  const handleSaveOpenRouterKey = useCallback(async () => {
    const key = keyDraft.trim();
    if (!key) return;
    await saveOpenRouterKey(key);
    setOpenRouterKeyState(key);
    setSnack('OpenRouter API key saved.');
  }, [keyDraft]);

  const handleSelectOpenRouterModel = useCallback(async (m: string) => {
    if (m === OPENROUTER_CUSTOM) {
      setKeyDraft(openrouterModel);
      setOpenModal('openrouter_custom_model');
      return;
    }
    setOpenRouterModelState(m);
    await saveOpenRouterModelPref(m);
    setSnack('OpenRouter model updated.');
  }, [openrouterModel]);

  const handleSaveOpenRouterCustomModel = useCallback(async () => {
    const m = keyDraft.trim();
    if (!m) return;
    setOpenRouterModelState(m);
    await saveOpenRouterModelPref(m);
    setSnack('OpenRouter model updated.');
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

  const openKeyModal = (id: string, currentValue: string) => {
    setKeyDraft(currentValue);
    setOpenModal(id);
  };

  const maskKey = (k: string) => k ? `••••••••${k.slice(-4)}` : 'Not set';
  const geminiModelLabel = GEMINI_MODELS.find(m => m.value === geminiModel)?.label ?? geminiModel;
  const groqModelLabel = GROQ_MODELS.find(m => m.value === groqModel)?.label ?? groqModel;
  const openrouterModelLabel = OPENROUTER_MODELS.find(m => m.value === openrouterModel)?.label ?? openrouterModel;
  const claudeModelLabel = CLAUDE_MODELS.find(m => m.value === claudeModel)?.label ?? claudeModel;
  const webSearchLabel = WEB_SEARCH_PROVIDERS.find(p => p.value === webSearchProvider)?.label ?? webSearchProvider;
  const agentModeLabel = AGENT_MODES.find(m => m.value === agentMode)?.label ?? agentMode;
  const providerLabel = LLM_PROVIDERS.find(p => p.value === activeProvider)?.label ?? activeProvider;

  const rebuildIndex = useCallback(async (uri: string) => {
    setIndexing(true);
    await clearNotes();
    try {
      const files = await scanVaultForMarkdown(uri);
      setNoteCount(files.length);
      const modelReady = gloveReady();
      for (const file of files) {
        const content = await StorageAccessFramework.readAsStringAsync(file.uri);
        const parsed = parseNote(content, noteTitle(file.relativePath));
        await upsertNote({
          id: file.relativePath,
          title: parsed.title,
          tags: parsed.tags,
          aliases: parsed.aliases,
          summary: extractDensestParagraph(parsed.body),
          outlinks: parsed.outlinks,
          type: parsed.type,
          area: parsed.area,
          status: parsed.status,
          lastModified: Date.now(),
        });
        await upsertLinks(file.relativePath, parsed.outlinks);
        if (modelReady) {
          const vec = gloveEmbed(parsed.body);
          if (vec) await setEmbedding(file.relativePath, Array.from(vec));
        }
      }
      const embCount = modelReady ? files.length : 0;
      setEmbeddedCount(embCount);
      setSnack(`Indexed ${files.length} notes${modelReady ? ' with embeddings' : ''}.`);
    } catch (e: any) {
      setSnack(`Indexing failed: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  }, []);

  const handleReindexAndEmbed = useCallback(async (uri: string) => {
    setOpenModal(null);
    // Download & load model if not already available
    if (!gloveDownloaded) {
      setGloveDownloading(true);
      setGloveDownloadProgress(0);
      try {
        await gloveDownloadModel((p) => setGloveDownloadProgress(Math.round(p * 100)));
        setGloveDownloaded(true);
        await gloveLoadVocab();
        setGloveLoaded(gloveReady());
      } catch (e: any) {
        setSnack(`Download failed: ${e.message}`);
        setGloveDownloading(false);
        return;
      }
      setGloveDownloading(false);
    } else if (!gloveLoaded) {
      await gloveLoadVocab();
      setGloveLoaded(gloveReady());
    }
    await rebuildIndex(uri);
  }, [gloveDownloaded, gloveLoaded, rebuildIndex]);



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
          {activeProvider === 'openrouter' ? (
            <>
              <SettingRow
                icon="key-outline"
                label="OpenRouter API Key"
                value={maskKey(openrouterKey)}
                onPress={() => openKeyModal('openrouter_key', openrouterKey)}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="chip"
                label="OpenRouter Model"
                value={openrouterModelLabel}
                onPress={() => setOpenModal('openrouter_model')}
              />
            </>
          ) : activeProvider === 'gemini' ? (
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

        {/* ── VAULT ── */}
        <SectionHeader title="VAULT" />
        <View style={styles.card}>
          <SettingRow
            icon="folder-outline"
            label="Vault"
            value={
              !vaultUri ? 'Not connected' :
              noteCount === 0 ? 'Connected · not indexed' :
              !gloveDownloaded ? `${noteCount} notes · no semantic model` :
              embeddedCount === 0 ? `${noteCount} notes · no embeddings yet` :
              `${noteCount} notes · ${embeddedCount} embeddings`
            }
            onPress={() => setOpenModal('vault')}
          />
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
        visible={openModal === 'openrouter_model'}
        title="OpenRouter Model"
        options={OPENROUTER_MODELS}
        selected={openrouterModel}
        onSelect={handleSelectOpenRouterModel}
        onClose={() => setOpenModal(null)}
      />

      {/* ── Key entry modals ── */}
      <KeyModal
        visible={openModal === 'openrouter_key'}
        title="OpenRouter API Key"
        placeholder="sk-or-..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveOpenRouterKey}
        onClose={() => setOpenModal(null)}
      />
      <KeyModal
        visible={openModal === 'openrouter_custom_model'}
        title="OpenRouter Model ID"
        placeholder="e.g. vendor/model:free"
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveOpenRouterCustomModel}
        onClose={() => setOpenModal(null)}
        secure={false}
      />
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
              {/* Re-index + Semantic Search (combined) */}
              <TouchableOpacity
                style={styles.vaultActionRow}
                activeOpacity={(indexing || gloveDownloading) ? 1 : 0.7}
                onPress={() => { if (!indexing && !gloveDownloading) handleReindexAndEmbed(vaultUri); }}
              >
                <View style={styles.vaultActionIcon}>
                  <MaterialCommunityIcons name="folder-refresh-outline" size={20} color="#6D28D9" />
                </View>
                <View style={styles.vaultActionText}>
                  <Text style={styles.vaultActionLabel}>Re-index Vault</Text>
                  <Text style={styles.vaultActionDesc}>
                    {gloveDownloading
                      ? `Downloading semantic model… ${gloveDownloadProgress}%`
                      : indexing
                        ? 'Indexing…'
                        : !gloveDownloaded
                          ? `${noteCount > 0 ? `${noteCount} notes indexed` : 'Not indexed yet'} · will download semantic model on first run`
                          : noteCount > 0
                            ? `${noteCount} notes · ${embeddedCount} embeddings`
                            : 'Scan vault and rebuild index with semantic embeddings'}
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
                  await clearNotes();
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

  keyModalAvoid: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  keyModalSheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
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
