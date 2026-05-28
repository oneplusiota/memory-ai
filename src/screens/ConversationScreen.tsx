import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { ChatBubble } from '@/components/ChatBubble';
import { useConversation } from '@/hooks/useConversation';
import type { RootStackParamList } from '@/navigation/AppNavigator';
import type { STTMode } from '@/types';

type Nav = StackNavigationProp<RootStackParamList, 'Conversation'>;
const STT_MODE_KEY = 'stt_mode';

export function ConversationScreen() {
  const navigation = useNavigation<Nav>();
  const [sttMode, setSttMode] = useState<STTMode>('native');
  const flatListRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    SecureStore.getItemAsync(STT_MODE_KEY).then((v) => {
      if (v) setSttMode(v as STTMode);
    });
  }, []);

  const {
    messages, transcript, isRecording, isSending, error,
    lastSuggestSave, handleTranscriptChange, toggleRecording,
    sendMessage, saveToVault, persistConversation, clearConversation,
  } = useConversation(sttMode);

  // Pulsing animation for recording button
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }).start();
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
    if (!text || isSending) return;
    await sendMessage(text);
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
  const canSend = hasText && !isRecording && !isSending;

  const renderInputButton = () => {
    if (isSending) {
      return (
        <View style={[styles.circleBtn, styles.circleBtnDisabled]}>
          <ActivityIndicator size={18} color="#FFFFFF" />
        </View>
      );
    }
    if (isRecording) {
      return (
        <Pressable onPress={toggleRecording}>
          <Animated.View style={[styles.circleBtn, styles.circleBtnRed, { transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.stopSquare} />
          </Animated.View>
        </Pressable>
      );
    }
    if (canSend) {
      return (
        <Pressable onPress={handleSend}>
          <View style={[styles.circleBtn, styles.circleBtnPurple]}>
            <MaterialCommunityIcons name="arrow-up" size={22} color="#FFFFFF" />
          </View>
        </Pressable>
      );
    }
    return (
      <Pressable onPress={toggleRecording} disabled={isSending}>
        <View style={[styles.circleBtn, styles.circleBtnPurple]}>
          <MaterialCommunityIcons name="microphone" size={22} color="#FFFFFF" />
        </View>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>memory.ai</Text>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearConversation} style={styles.headerBtn}>
              <MaterialCommunityIcons name="plus" size={22} color="#374151" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('History')} style={styles.headerBtn}>
            <MaterialCommunityIcons name="clock-outline" size={22} color="#374151" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.headerBtn}>
            <MaterialCommunityIcons name="cog-outline" size={22} color="#374151" />
          </TouchableOpacity>
        </View>
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

      {/* Input bar */}
      <View style={styles.inputBar}>
        <View style={styles.inputWrapper}>
          {isRecording && (
            <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
          )}
          <TextInput
            style={styles.input}
            value={transcript}
            onChangeText={handleTranscriptChange}
            placeholder={isRecording ? 'Listening…' : 'Ask anything or share a thought…'}
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isSending}
            onSubmitEditing={handleSend}
          />
        </View>
        {renderInputButton()}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { padding: 8 },

  list: { flex: 1, backgroundColor: '#FFFFFF' },
  listContent: { paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, gap: 8 },
  emptyText: { color: '#6B7280', fontSize: 16, fontWeight: '500' },
  emptySubText: { color: '#9CA3AF', fontSize: 14 },

  errorBar: { backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 8 },
  errorText: { color: '#991B1B', fontSize: 13 },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 14,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 46,
    maxHeight: 120,
    gap: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingTop: 0,
    paddingBottom: 0,
  },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleBtnPurple: { backgroundColor: '#6D28D9' },
  circleBtnRed: { backgroundColor: '#EF4444' },
  circleBtnDisabled: { backgroundColor: '#D1D5DB' },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});
