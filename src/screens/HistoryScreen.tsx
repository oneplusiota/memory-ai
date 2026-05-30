import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useVault } from '@/hooks/useVault';
import { listConversationFiles } from '@/services/vault/VaultWriter';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'History'>;

type ConversationEntry = {
  relativePath: string;
  title: string;
  date: string;
  time: string;
  extracted: boolean;
  preview: string;
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function ConversationCard({
  entry,
  onPress,
}: {
  entry: ConversationEntry;
  onPress: () => void;
}) {
  const previewText = entry.preview || entry.title;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{formatDate(entry.date)}</Text>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.cardTime}>{entry.time}</Text>
          {entry.extracted && (
            <View style={styles.savedBadge}>
              <Text style={styles.savedBadgeText}>✦ extracted</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardDivider} />
      <Text style={styles.cardPreview} numberOfLines={3}>
        {previewText || 'No preview available'}
      </Text>
    </TouchableOpacity>
  );
}

export function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { vaultUri } = useVault();
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    if (!vaultUri) return;
    setLoading(true);
    listConversationFiles(vaultUri)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [vaultUri]));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.relativePath}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {loading ? 'Loading…' : 'No conversations yet'}
            </Text>
            {!loading && (
              <Text style={styles.emptySubtitle}>
                Start a conversation and navigate away to save it here.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ConversationCard
            entry={item}
            onPress={() => navigation.navigate('Conversation', { resumeFilePath: item.relativePath })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, flexGrow: 1 },
  separator: { height: 10 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  savedBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  savedBadgeText: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: '500',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginBottom: 10,
  },
  cardPreview: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 21,
  },
});
