import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import type { Entry } from '@/services/db/EntryDB';
import { formatEntryTime } from '@/utils/dateUtils';

type Props = {
  entry: Entry;
  onPress: (entry: Entry) => void;
  onLongPress: (entry: Entry) => void;
};

export function EntryCard({ entry, onPress, onLongPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => onPress(entry)}
      onLongPress={() => onLongPress(entry)}
      delayLongPress={400}
    >
      <Text style={styles.time}>{formatEntryTime(entry.createdAt)}</Text>
      <Text style={styles.text} numberOfLines={6}>{entry.text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  time: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  text: { fontSize: 15, lineHeight: 22, color: '#111827' },
});
