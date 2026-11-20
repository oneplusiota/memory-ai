import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { EntryCard } from '@/components/EntryCard';
import { useDictation } from '@/hooks/useDictation';
import { useEntries } from '@/hooks/useEntries';
import type { Entry } from '@/services/db/EntryDB';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  const { entries, query, setQuery, loading, error: listError, loadMore, add, edit, remove } = useEntries();
  const dictation = useDictation();
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [editText, setEditText] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(keyboardHeight, { toValue: e.endCoordinates.height, duration: 150, useNativeDriver: false }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [keyboardHeight]);

  useEffect(() => {
    if (dictation.isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.18, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }, [dictation.isRecording, pulse]);

  const save = async (text: string) => {
    if (!text.trim()) return;
    try {
      await add(text);
      dictation.clear();
      setSaveError(null);
    } catch (e: any) {
      // Keep the text in the box so nothing is lost
      setSaveError(e?.message ?? 'Could not save. Your text is still in the box.');
    }
  };

  /** Mic: first tap starts listening, second tap stops and saves — no extra step. */
  const onMic = async () => {
    if (!dictation.isRecording) {
      await dictation.toggle();
      return;
    }
    const text = await dictation.finish();
    await save(text);
  };

  const onSend = async () => {
    const text = dictation.isRecording ? await dictation.finish() : dictation.text.trim();
    await save(text);
  };

  const openEdit = (entry: Entry) => {
    setEditing(entry);
    setEditText(entry.text);
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    const text = editText.trim();
    if (text && text !== editing.text) await edit(editing.id, text);
    closeEdit();
  };

  const confirmDelete = () => {
    if (!editing) return;
    const target = editing;
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          closeEdit();
          await remove(target.id);
        },
      },
    ]);
  };

  const copy = async (entry: Entry) => {
    await Clipboard.setStringAsync(entry.text);
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  };

  const toggleSearch = () => {
    if (searching) setQuery('');
    setSearching((s) => !s);
  };

  const hasText = dictation.text.trim().length > 0;
  const error = dictation.error ?? saveError ?? listError;

  return (
    <Animated.View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {searching ? (
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search your entries"
              placeholderTextColor="#9CA3AF"
              autoFocus
              returnKeyType="search"
            />
          </View>
        ) : (
          <Text style={styles.title}>memory.ai</Text>
        )}
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleSearch} style={styles.headerBtn} accessibilityLabel={searching ? 'Close search' : 'Search'}>
            <MaterialCommunityIcons name={searching ? 'close' : 'magnify'} size={24} color="#374151" />
          </TouchableOpacity>
          {!searching && (
            <>
              <TouchableOpacity onPress={() => navigation.navigate('Ask')} style={styles.headerBtn} accessibilityLabel="Ask the assistant">
                <MaterialCommunityIcons name="message-text-outline" size={22} color="#374151" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerBtn} accessibilityLabel="Settings">
                <MaterialCommunityIcons name="cog-outline" size={22} color="#374151" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryCard entry={item} onPress={openEdit} onLongPress={copy} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={entries.length === 0 ? styles.emptyWrap : styles.listContent}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name={query ? 'magnify-close' : 'microphone-outline'} size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>{query ? 'No entries match' : 'Nothing captured yet'}</Text>
              <Text style={styles.emptySub}>{query ? 'Try a shorter or different word' : 'Tap the mic, say it, tap again to save'}</Text>
            </View>
          )
        }
      />

      {!!error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={dictation.text}
            onChangeText={dictation.onChangeText}
            placeholder={dictation.isRecording ? 'Listening…' : 'Tap the mic, or type a note…'}
            placeholderTextColor="#9CA3AF"
            multiline
          />
          {hasText && (
            <Pressable onPress={onSend} style={styles.sendBtn} hitSlop={8} accessibilityLabel="Save entry">
              <View style={styles.sendCircle}>
                <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
              </View>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={onMic}
          hitSlop={10}
          style={({ pressed }) => [styles.mic, dictation.isRecording && styles.micActive, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={dictation.isRecording ? 'Stop and save' : 'Start recording'}
        >
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <MaterialCommunityIcons name={dictation.isRecording ? 'stop' : 'microphone'} size={30} color="#FFFFFF" />
          </Animated.View>
        </Pressable>
      </View>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalWrap}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeEdit} />
          <View style={styles.modalCard}>
            <TextInput
              style={styles.modalInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholder="Entry text"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={confirmDelete} style={styles.modalBtn}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={closeEdit} style={styles.modalBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} style={[styles.modalBtn, styles.saveBtn]}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', paddingLeft: 4 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerBtn: { padding: 8 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 0 },

  listContent: { paddingVertical: 8 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptySub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center' },

  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: '#991B1B', fontSize: 13 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#F3F4F6', borderRadius: 26, paddingLeft: 16, paddingRight: 6,
    paddingVertical: 6, minHeight: 56, maxHeight: 140,
  },
  input: { flex: 1, fontSize: 16, color: '#111827', paddingTop: 8, paddingBottom: 8, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendCircle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#6D28D9',
    alignItems: 'center', justifyContent: 'center',
  },
  mic: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#6D28D9',
    alignItems: 'center', justifyContent: 'center', elevation: 4,
  },
  micActive: { backgroundColor: '#DC2626' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, elevation: 8 },
  modalInput: {
    minHeight: 120, maxHeight: 320, fontSize: 16, lineHeight: 23, color: '#111827',
    textAlignVertical: 'top', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  saveBtn: { backgroundColor: '#6D28D9' },
  saveText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  deleteText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
});
