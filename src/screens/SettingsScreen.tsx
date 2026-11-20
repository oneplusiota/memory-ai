import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button, Snackbar, Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { requestPinWidget } from 'react-native-android-widget';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { countEntries } from '@/services/db/EntryDB';
import { importVault } from '@/services/import/VaultImport';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { clearSyncConfig, loadSyncParts, saveSyncRepo, saveSyncToken } from '@/services/sync/SyncConfig';
import { parseRepoInput } from '@/services/sync/repoInput';
import { SyncError } from '@/services/sync/errors';
import { resetSync, restoreFromBackup, syncNow, testConnection } from '@/services/sync/SyncManager';
import {
  saveGeminiKey, saveGroqKey, saveClaudeKey, saveOpenRouterKey, saveActiveProvider,
  saveGeminiModelPref, saveGroqModelPref, saveClaudeModelPref, saveOpenRouterModelPref, loadStoredKeys,
} from '@/services/llm/ProviderConfig';
import type { LLMProvider } from '@/types';

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

function syncStatusText(s: ReturnType<typeof useSyncStatus>): string {
  if (s.state === 'syncing') return 'Syncing…';
  if (s.state === 'error' && s.error) return `${s.error.message}${s.pending ? ` (${s.pending} waiting)` : ''} — tap to retry`;
  if (s.pending > 0) return `${s.pending} waiting to back up — tap to sync now`;
  if (s.lastSyncedAt) return `All backed up · ${new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return 'Up to date';
}

export function SettingsScreen() {
  const sync = useSyncStatus();
  const [syncRepo, setSyncRepo] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [restoring, setRestoring] = useState('');
  const [importing, setImporting] = useState('');
  const [entryCount, setEntryCount] = useState(0);
  const [snack, setSnack] = useState('');

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

      setEntryCount(await countEntries());

      const parts = await loadSyncParts();
      setSyncRepo(parts.repo);
      setSyncToken(parts.token);
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

  const openKeyModal = (id: string, currentValue: string) => {
    setKeyDraft(currentValue);
    setOpenModal(id);
  };

  const maskKey = (k: string) => k ? `••••••••${k.slice(-4)}` : 'Not set';
  const geminiModelLabel = GEMINI_MODELS.find(m => m.value === geminiModel)?.label ?? geminiModel;
  const groqModelLabel = GROQ_MODELS.find(m => m.value === groqModel)?.label ?? groqModel;
  const openrouterModelLabel = OPENROUTER_MODELS.find(m => m.value === openrouterModel)?.label ?? openrouterModel;
  const claudeModelLabel = CLAUDE_MODELS.find(m => m.value === claudeModel)?.label ?? claudeModel;
  const providerLabel = LLM_PROVIDERS.find(p => p.value === activeProvider)?.label ?? activeProvider;

  const handleSaveRepo = useCallback(async () => {
    const parsed = parseRepoInput(keyDraft);
    if (!parsed) {
      setSnack('Enter the repository as owner/name, e.g. oneplusiota/memory-data.');
      return;
    }
    const slug = `${parsed.owner}/${parsed.repo}`;
    await saveSyncRepo(slug);
    setSyncRepo(slug);
    if (syncToken) {
      setSnack('Backup repository saved. Syncing…');
      resetSync();
    } else {
      setSnack('Repository saved. Now add the access token.');
    }
  }, [keyDraft, syncToken]);

  const handleSaveToken = useCallback(async () => {
    const token = keyDraft.trim();
    if (!token) return;
    const parsed = parseRepoInput(syncRepo);
    if (!parsed) {
      setSnack('Set the backup repository first.');
      return;
    }
    setSnack('Checking the token…');
    try {
      await testConnection(parsed.owner, parsed.repo, token);
    } catch (e) {
      setSnack(e instanceof SyncError ? e.message : 'Could not reach GitHub.');
      return;
    }
    await saveSyncToken(token);
    setSyncToken(token);
    setSnack('Backup connected. Syncing…');
    resetSync();
  }, [keyDraft, syncRepo]);

  const handleDisconnectBackup = useCallback(async () => {
    await clearSyncConfig();
    setSyncRepo('');
    setSyncToken('');
    resetSync();
    setSnack('Backup disconnected. Your entries on this phone are untouched.');
  }, []);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    try {
      setRestoring('Reading backup…');
      const r = await restoreFromBackup((done, total) => setRestoring(`Restoring ${done}/${total}…`));
      setEntryCount(await countEntries());
      setSnack(
        r.found === 0 ? 'The backup is empty.' :
        `Restored ${r.added} new of ${r.found} entries` + (r.unreadable ? `, ${r.unreadable} unreadable` : '') + '.',
      );
    } catch (e) {
      setSnack(e instanceof SyncError ? e.message : 'Restore failed.');
    } finally {
      setRestoring('');
    }
  }, [restoring]);

  const handleAddWidget = useCallback(async () => {
    try {
      const ok = await requestPinWidget({ widgetName: 'QuickCapture' });
      if (!ok) setSnack('Your launcher cannot add widgets from here. Long-press the home screen → Widgets → memory.ai.');
    } catch {
      setSnack('Long-press the home screen → Widgets → memory.ai → Quick capture.');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (importing) return;
    try {
      const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      setImporting('Reading vault…');
      const res = await importVault(perm.directoryUri, (done, total) => setImporting(`Importing ${done}/${total}…`));
      setEntryCount(await countEntries());
      setSnack(
        `Imported ${res.imported} notes` +
        (res.skipped ? `, ${res.skipped} skipped` : '') +
        (res.failed ? `, ${res.failed} failed` : '') + '.',
      );
    } catch (e: any) {
      setSnack(`Import failed: ${e?.message ?? 'unknown error'}`);
    } finally {
      setImporting('');
    }
  }, [importing]);

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

        {/* ── BACKUP ── */}
        <SectionHeader title="BACKUP" />
        <View style={styles.card}>
          <SettingRow
            icon="github"
            label="Private repository"
            value={syncRepo || 'Not set (e.g. oneplusiota/memory-data)'}
            onPress={() => openKeyModal('sync_repo', syncRepo)}
          />
          <View style={styles.cardDivider} />
          <SettingRow
            icon="key-outline"
            label="Access token"
            value={maskKey(syncToken)}
            onPress={() => openKeyModal('sync_token', '')}
          />
          {!!syncRepo && !!syncToken && (
            <>
              <View style={styles.cardDivider} />
              <SettingRow
                icon="cloud-sync-outline"
                label="Backup status"
                value={syncStatusText(sync)}
                onPress={() => { syncNow(); }}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="cloud-download-outline"
                label="Restore from backup"
                value={restoring || 'Adds entries missing on this phone'}
                onPress={handleRestore}
              />
              <View style={styles.cardDivider} />
              <SettingRow
                icon="link-off"
                label="Disconnect backup"
                danger
                onPress={handleDisconnectBackup}
              />
            </>
          )}
        </View>

        <Divider />

        {/* ── WIDGET ── */}
        <SectionHeader title="HOME SCREEN" />
        <View style={styles.card}>
          <SettingRow
            icon="widgets-outline"
            label="Add quick-capture widget"
            value="One tap to start dictating"
            onPress={handleAddWidget}
          />
        </View>

        <Divider />

        {/* ── DATA ── */}
        <SectionHeader title="DATA" />
        <View style={styles.card}>
          <SettingRow
            icon="note-multiple-outline"
            label="Entries"
            value={`${entryCount} saved on this device`}
            onPress={() => {}}
          />
          <View style={styles.cardDivider} />
          <SettingRow
            icon="folder-download-outline"
            label="Import from Obsidian vault"
            value={importing || 'One-time: each note becomes an entry'}
            onPress={handleImport}
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
        visible={openModal === 'sync_repo'}
        title="Backup repository"
        placeholder="owner/name"
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveRepo}
        onClose={() => setOpenModal(null)}
        secure={false}
      />
      <KeyModal
        visible={openModal === 'sync_token'}
        title="GitHub access token"
        placeholder="github_pat_..."
        value={keyDraft}
        onChange={setKeyDraft}
        onSave={handleSaveToken}
        onClose={() => setOpenModal(null)}
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
});
