import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Keyboard,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/ChatBubble';
import { useConversation } from '@/hooks/useConversation';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'Conversation'>;

export function ConversationScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const keyboardHeight = useRef(new Animated.Value(0)).current;

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

  const {
    messages, transcript, isRecording, isSending, error,
    toolSteps, pendingConfirm, confirmToolWrite,
    handleTranscriptChange, toggleRecording, sendMessage, clearConversation,
  } = useConversation();

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

  const handleSend = () => {
    if (!transcript.trim() || isSending) return;
    sendMessage();
  };

  const hasText = transcript.trim().length > 0;

  return (
    <Animated.View style={[styles.container, { paddingBottom: keyboardHeight }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>memory.ai</Text>
        <View style={styles.headerRight}>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearConversation} style={styles.headerBtn}>
              <MaterialCommunityIcons name="plus" size={22} color="#374151" />
            </TouchableOpacity>
          )}
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
        renderItem={({ item }) => <ChatBubble message={item} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="microphone-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>Tap the mic to start speaking</Text>
            <Text style={styles.emptySubText}>Tap it again to stop, then send</Text>
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
              {`Write to "${pendingConfirm.path}"`}
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

      {/* Input bar — big mic button for one-thumb capture */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={transcript}
            onChangeText={handleTranscriptChange}
            placeholder={isRecording ? 'Listening…' : 'Tap the mic and talk, or type here…'}
            placeholderTextColor="#9CA3AF"
            multiline
            editable={!isSending}
            onBlur={() => Animated.timing(keyboardHeight, { toValue: 0, duration: 150, useNativeDriver: false }).start()}
          />
          {isSending ? (
            <View style={styles.sendBtn}>
              <ActivityIndicator size={18} color="#6D28D9" />
            </View>
          ) : hasText ? (
            <Pressable onPress={handleSend} style={styles.sendBtn} hitSlop={8}>
              <View style={styles.sendCircle}>
                <MaterialCommunityIcons name="arrow-up" size={18} color="#FFFFFF" />
              </View>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={toggleRecording}
          disabled={isSending}
          hitSlop={10}
          style={({ pressed }) => [
            styles.micBtn,
            isRecording && styles.micBtnActive,
            isSending && styles.micBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <MaterialCommunityIcons
              name={isRecording ? 'stop' : 'microphone'}
              size={30}
              color="#FFFFFF"
            />
          </Animated.View>
        </Pressable>
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
    paddingHorizontal: 16, paddingBottom: 12,
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
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    borderRadius: 26,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 56,
    maxHeight: 140,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 120,
  },
  sendBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  micBtnActive: { backgroundColor: '#DC2626' },
  micBtnDisabled: { opacity: 0.4 },
});
