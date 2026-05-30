import React from 'react';
import { StyleSheet, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import type { ConversationMessage } from '@/types';

type Props = {
  message: ConversationMessage;
  suggestSave?: boolean;
  onSave?: () => void;
};

export function ChatBubble({ message, suggestSave, onSave }: Props) {
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.text);
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  };

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAI]}>
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>✦</Text>
        </View>
      )}
      <View style={styles.bubbleWrapper}>
        <TouchableOpacity
          onLongPress={handleCopy}
          activeOpacity={0.85}
          delayLongPress={400}
        >
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
            <Text style={[styles.text, isUser ? styles.textUser : styles.textAI]}>
              {message.text}
            </Text>
          </View>
        </TouchableOpacity>
        {suggestSave && onSave && (
          <TouchableOpacity style={styles.savePill} onPress={onSave}>
            <Text style={styles.savePillText}>💾 Save to vault</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 16, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  rowAI: { justifyContent: 'flex-start' },
  avatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
    marginRight: 8, marginBottom: 2, flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 11 },
  bubbleWrapper: { maxWidth: '80%', gap: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#1A1A1A', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#F0F0F0', borderBottomLeftRadius: 4 },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#FFFFFF' },
  textAI: { color: '#1A1A1A' },
  savePill: {
    alignSelf: 'flex-start', backgroundColor: '#EDE9FE',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
  },
  savePillText: { color: '#6D28D9', fontSize: 13, fontWeight: '500' },
});
