import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { ChatBubble } from '@/components/ChatBubble';
import { useConversation } from '@/hooks/useConversation';
import type { RootStackParamList } from '@/navigation/AppNavigator';
import type { ConversationMode, STTMode } from '@/types';

const MODES: { id: ConversationMode; label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'coach', label: 'Coach' },
  { id: 'analyst', label: 'Analyst' },
  { id: 'devil', label: "Devil's Advocate" },
  { id: 'tool_builder', label: '🔧 Tool Builder' },
];

type Nav = StackNavigationProp<RootStackParamList, 'Conversation'>;
type Route = RouteProp<RootStackParamList, 'Conversation'>;
const STT_MODE_KEY = 'stt_mode';

export function ConversationScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const [sttMode, setSttMode] = useState<STTMode>('native');
  const flatListRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height + 12,
        duration: 150,
        useNativeDriver: false,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [keyboardHeight]);

  useEffect(() => {
    SecureStore.getItemAsync(STT_MODE_KEY).then((v) => {
      if (v) setSttMode(v as STTMode);
    });
  }, []);

  const {
    messages, transcript, isRecording, isSending, error,
    lastSuggestSave, conversationMode, setConversationMode,
    toolSteps, pendingConfirm, confirmToolWrite,
    handleTranscriptChange, toggleRecording,
    sendMessage, saveToVault, loadConversation, persistConversation, clearConversation,
  } = useConversation(sttMode, route.params?.initialMode as ConversationMode | undefined);

  // Load a past conversation when vaultUri becomes available (loadConversation
  // changes reference only when vaultUri changes, so this retries until ready)
  const resumeFilePath = route.params?.resumeFilePath;
  useEffect(() => {
    if (resumeFilePath && messages.length === 0) {
      loadConversation(resumeFilePath);
    }
  }, [resumeFilePath, loadConversation]);

  // Pulsing animation for mic icon while recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 100, useNativeDriver: true }).start();
    }
  }, [isRecording, pulseAnim]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // Auto-persist on navigate away
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => persistConversation());
    return unsub;
  }, [navigation, persistConversation]);

  const handleSend = async () => {
    const text = transcript.trim();
    if (!text || isSending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await sendMessage(text);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleSaveToVault = async () => {
    const result = await saveToVault();
    if (result) {
      navigation.navigate('Confirm', {
        decision: result.decision,
        vaultUri: result.vaultUri,
        conversationFilePath: result.conversationFilePath ?? undefined,
      });
    }
  };

  const hasText = transcript.trim().length > 0;

  return (
    <Animated.View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>memory.ai</Text>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearConversation} style={styles.headerBtn}>
              <MaterialCommunityIcons name="plus" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('Tools')} style={styles.headerBtn}>
            <MaterialCommunityIcons name="tools" size={22} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('History')} style={styles.headerBtn}>
            <MaterialCommunityIcons name="clock-outline" size={22} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerBtn}>
            <MaterialCommunityIcons name="cog-outline" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode chip row */}
      <View style={styles.modeBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modeBarContent}
        >
          {MODES.map((m) => {
            const active = conversationMode === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => setConversationMode(m.id)}
                style={[styles.modeChip, active && styles.modeChipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Chat list */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => (
          <ChatBubble
            message={item}
            suggestSave={
              item.role === 'assistant' &&
              index === messages.length - 1 &&
              lastSuggestSave
            }
            onSave={handleSaveToVault}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="microphone-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>Tap the mic to start speaking</Text>
            <Text style={styles.emptySubText}>Or type a message below</Text>
          </View>
        }
      />

      {/* Error */}
      {!!error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Tool steps strip — shown while agent is running */}
      {isSending && toolSteps.length > 0 && (
        <View style={styles.toolStepsBar}>
          <Text style={styles.toolStepText} numberOfLines={1}>
            {toolSteps[toolSteps.length - 1].type === 'tool_call'
              ? `⚙️ Calling ${toolSteps[toolSteps.length - 1].name}…`
              : `✓ ${toolSteps[toolSteps.length - 1].name}`}
          </Text>
        </View>
      )}

      {/* Tool write confirmation modal */}
      {!!pendingConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Allow write?</Text>
            <Text style={styles.confirmDesc}>
              {pendingConfirm.toolName === 'create_event'
                ? `Create calendar event: ${pendingConfirm.path}`
                : `Write to "${pendingConfirm.path}"`}
            </Text>
            <View style={styles.confirmBtns}>
              <Pressable style={[styles.confirmBtn, styles.confirmDeny]} onPress={() => confirmToolWrite(false)}>
                <Text style={styles.confirmDenyText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.confirmBtn, styles.confirmAllow]} onPress={() => confirmToolWrite(true)}>
                <Text style={styles.confirmAllowText}>Allow</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Input bar — buttons live inside the rounded input box */}
      <View style={styles.inputBar}>
        <View style={styles.inputWrapper}>
          {/* Left: mic (idle) or stop (recording) */}
          <Pressable
            onPress={isSending ? undefined : toggleRecording}
            style={styles.innerBtn}
            disabled={isSending}
          >
            {isRecording ? (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <MaterialCommunityIcons name="stop-circle" size={22} color="#EF4444" />
              </Animated.View>
            ) : (
              <MaterialCommunityIcons
                name="microphone"
                size={22}
                color={isSending ? '#D1D5DB' : '#6D28D9'}
              />
            )}
          </Pressable>

          {/* Center: text input */}
          <TextInput
            style={styles.input}
            value={transcript}
            onChangeText={handleTranscriptChange}
            placeholder={isRecording ? 'Listening…' : 'Ask anything or share a thought…'}
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isSending}
            onSubmitEditing={handleSend}
            onBlur={() => Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start()}
          />

          {/* Right: send or spinner — only when there's text */}
          {isSending ? (
            <View style={styles.innerBtn}>
              <ActivityIndicator size={18} color="#6D28D9" />
            </View>
          ) : hasText ? (
            <Pressable onPress={handleSend} style={styles.innerBtn}>
              <View style={styles.sendCircle}>
                <MaterialCommunityIcons name="arrow-up" size={16} color="#FFFFFF" />
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  toolStepsBar: {
    backgroundColor: '#F5F3FF', paddingHorizontal: 16, paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DDD6FE',
  },
  toolStepText: { fontSize: 12, color: '#7C3AED' },

  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', zIndex: 99,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginHorizontal: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  confirmDesc: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  confirmBtns: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  confirmBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8 },
  confirmDeny: { backgroundColor: '#F3F4F6' },
  confirmDenyText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  confirmAllow: { backgroundColor: '#6D28D9' },
  confirmAllowText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },

  modeBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modeBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modeChipActive: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  modeChipTextActive: {
    color: '#FFFFFF',
  },

  list: { flex: 1, backgroundColor: '#FFFFFF' },
  listContent: { paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
  emptyText: { color: '#6B7280', fontSize: 16, fontWeight: '500' },
  emptySubText: { color: '#9CA3AF', fontSize: 14 },

  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: '#991B1B', fontSize: 13 },

  inputBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 26,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 46,
    maxHeight: 130,
    gap: 2,
  },
  innerBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingTop: 4,
    paddingBottom: 4,
    maxHeight: 100,
  },
  sendCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
