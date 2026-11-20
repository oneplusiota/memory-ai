import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Keyboard, Pressable, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/ChatBubble';
import { useChat } from '@/hooks/useChat';
import { useDictation } from '@/hooks/useDictation';

export function AskScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const { messages, isSending, error, step, send, clear } = useChat();
  const dictation = useDictation();
  const [sending, setSending] = useState(false);

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
    if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  const ask = async () => {
    if (sending || isSending) return;
    setSending(true);
    try {
      const text = dictation.isRecording ? await dictation.finish() : dictation.text.trim();
      if (!text) return;
      dictation.clear();
      await send(text);
    } finally {
      setSending(false);
    }
  };

  const hasText = dictation.text.trim().length > 0;
  const status = step?.type === 'tool_call' ? 'Searching your entries…' : isSending ? 'Thinking…' : null;
  const err = dictation.error ?? error;

  return (
    <Animated.View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.title}>Ask</Text>
        <TouchableOpacity
          onPress={clear}
          style={[styles.headerBtn, messages.length === 0 && { opacity: 0 }]}
          disabled={messages.length === 0}
          accessibilityLabel="New chat"
        >
          <MaterialCommunityIcons name="plus" size={24} color="#374151" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={messages.length === 0 ? styles.emptyWrap : styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="message-text-outline" size={44} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>Ask about your entries</Text>
            <Text style={styles.emptySub}>"What did I do last week?" · "When did my knee start hurting?"</Text>
          </View>
        }
      />

      {!!status && (
        <View style={styles.statusBar}>
          <ActivityIndicator size={12} color="#6D28D9" />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}
      {!!err && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{err}</Text>
        </View>
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={dictation.text}
            onChangeText={dictation.onChangeText}
            placeholder={dictation.isRecording ? 'Listening…' : 'Ask a question…'}
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isSending}
          />
          {hasText && !isSending && (
            <Pressable onPress={ask} style={styles.iconBtn} hitSlop={8} accessibilityLabel="Send">
              <View style={styles.sendCircle}>
                <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF" />
              </View>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={dictation.toggle}
          disabled={isSending}
          hitSlop={10}
          style={[styles.mic, dictation.isRecording && styles.micActive, isSending && { opacity: 0.4 }]}
          accessibilityLabel={dictation.isRecording ? 'Stop recording' : 'Start recording'}
        >
          <MaterialCommunityIcons name={dictation.isRecording ? 'stop' : 'microphone'} size={26} color="#FFFFFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerBtn: { padding: 8 },
  title: { fontSize: 17, fontWeight: '600', color: '#111827' },
  listContent: { paddingVertical: 12 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#F5F3FF' },
  statusText: { fontSize: 12, color: '#7C3AED' },
  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: '#991B1B', fontSize: 13 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'flex-end',
    backgroundColor: '#F3F4F6', borderRadius: 24, paddingLeft: 16, paddingRight: 6,
    paddingVertical: 4, minHeight: 52, maxHeight: 140,
  },
  input: { flex: 1, fontSize: 16, color: '#111827', paddingTop: 8, paddingBottom: 8, maxHeight: 120 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#6D28D9', alignItems: 'center', justifyContent: 'center' },
  mic: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#6D28D9', alignItems: 'center', justifyContent: 'center', elevation: 3 },
  micActive: { backgroundColor: '#DC2626' },
});
