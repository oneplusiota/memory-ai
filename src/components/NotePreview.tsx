import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Chip, Text } from 'react-native-paper';
import type { NoteNode } from '@/types';

type Props = { note: NoteNode };

export function NotePreview({ note }: Props) {
  return (
    <Card style={styles.card} mode="outlined">
      <Card.Content style={styles.content}>
        <Text variant="titleSmall" numberOfLines={1}>{note.title}</Text>
        <Text variant="bodySmall" style={styles.path} numberOfLines={1}>{note.id}</Text>
        <Text variant="bodySmall" style={styles.summary} numberOfLines={3}>{note.summary}</Text>
        {note.tags.length > 0 && (
          <Chip compact style={styles.tag}>{note.tags.join(', ')}</Chip>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 4 },
  content: { gap: 4 },
  path: { color: '#888', fontFamily: 'monospace' },
  summary: { color: '#444', marginTop: 4 },
  tag: { alignSelf: 'flex-start', marginTop: 4 },
});
