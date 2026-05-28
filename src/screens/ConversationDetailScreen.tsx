import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { ChatBubble } from '@/components/ChatBubble';
import { useVault } from '@/hooks/useVault';
import type { ConversationMessage } from '@/types';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type RouteProps = RouteProp<RootStackParamList, 'ConversationDetail'>;

let idCounter = 0;

export function ConversationDetailScreen() {
  const { params } = useRoute<RouteProps>();
  const { vaultUri } = useVault();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [meta, setMeta] = useState({ title: '', extracted: false });

  useEffect(() => {
    if (!vaultUri) return;
    (async () => {
      try {
        const parts = params.relativePath.split('/');
        let currentUri = vaultUri;
        for (const part of parts) {
          // Re-read directory at each level — don't reuse top-level entries
          const levelEntries = await StorageAccessFramework.readDirectoryAsync(currentUri);
          const match = levelEntries.find(
            (e: string) => decodeURIComponent(e.split('%2F').pop() ?? '') === part,
          );
          if (!match) return;
          currentUri = match;
        }
        const content = await StorageAccessFramework.readAsStringAsync(currentUri);
        setMessages(parseConversationContent(content));
        setMeta(parseMeta(content));
      } catch {
        // ignore
      }
    })();
  }, [vaultUri, params.relativePath]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {meta.extracted && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✦ Extracted to notes</Text>
        </View>
      )}
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages to display.</Text>
          </View>
        }
        renderItem={({ item }) => <ChatBubble message={item} />}
      />
    </SafeAreaView>
  );
}

function parseMeta(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { title: '', extracted: false };
  const raw = match[1];
  const title = (raw.match(/^title: (.+)$/m)?.[1] ?? '').trim();
  const extracted = raw.match(/^extracted: true$/m) !== null;
  return { title, extracted };
}

function parseConversationContent(content: string): ConversationMessage[] {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = body.split('\n\n').map(l => l.trim()).filter(Boolean);
  return lines.map((line) => {
    const userMatch = line.match(/^\*\*You\*\*: ([\s\S]+)$/);
    const aiMatch = line.match(/^\*\*AI\*\*: ([\s\S]+)$/);
    if (userMatch) return { id: String(++idCounter), role: 'user' as const, text: userMatch[1].trim(), timestamp: 0 };
    if (aiMatch) return { id: String(++idCounter), role: 'assistant' as const, text: aiMatch[1].trim(), timestamp: 0 };
    return null;
  }).filter((m): m is ConversationMessage => m !== null);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  badge: { alignSelf: 'center', marginTop: 12, marginBottom: 4, backgroundColor: '#EDE9FE', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  badgeText: { color: '#6D28D9', fontSize: 13 },
  content: { paddingTop: 8, paddingBottom: 40 },
  emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#9CA3AF' },
});
