import React from 'react';
import { StyleSheet, ToastAndroid, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import type { ConversationMessage } from '@/types';

export function ChatBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';

  const copy = async () => {
    await Clipboard.setStringAsync(message.text);
    ToastAndroid.show('Copied', ToastAndroid.SHORT);
  };

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAI]}>
      <TouchableOpacity onLongPress={copy} activeOpacity={0.85} delayLongPress={400} style={styles.wrap}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          <Text style={[styles.text, isUser ? styles.textUser : styles.textAI]}>{message.text}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 16 },
  rowUser: { justifyContent: 'flex-end' },
  rowAI: { justifyContent: 'flex-start' },
  wrap: { maxWidth: '85%' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#1A1A1A', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#F0F0F0', borderBottomLeftRadius: 4 },
  text: { fontSize: 15, lineHeight: 22 },
  textUser: { color: '#FFFFFF' },
  textAI: { color: '#1A1A1A' },
});
