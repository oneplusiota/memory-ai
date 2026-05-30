import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Snackbar, Text } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { appendToDailyNote, appendToNote, createNote, updateConversationMeta } from '@/services/vault/VaultWriter';
import { upsertNote, upsertLinks } from '@/services/db/VaultDB';
import { parseNote } from '@/services/vault/MarkdownParser';
import { extractDensestParagraph } from '@/utils/textUtils';
import { noteTitle } from '@/utils/pathUtils';
import type { RootStackParamList } from '@/navigation/AppNavigator';

type RouteProps = RouteProp<RootStackParamList, 'Confirm'>;

export function ConfirmUpdateScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProps>();
  const { decision, vaultUri, conversationFilePath } = params;
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleApply = async () => {
    setLoading(true);
    setErrorMsg('');
    const atomsTouched: string[] = [];
    let success = false;
    try {
      // Write daily entry
      const dailyPath = await appendToDailyNote(vaultUri, decision.daily_entry);
      const dailyParsed = parseNote(decision.daily_entry, noteTitle(dailyPath));
      await upsertNote({
        id: dailyPath, title: dailyParsed.title, tags: dailyParsed.tags,
        aliases: dailyParsed.aliases, summary: extractDensestParagraph(dailyParsed.body),
        outlinks: dailyParsed.outlinks, type: 'daily', lastModified: Date.now(),
      });
      await upsertLinks(dailyPath, dailyParsed.outlinks);

      // Write each atom note
      for (const op of decision.notes) {
        if (!op.path || !op.content) continue;
        if (op.action === 'update_atom') {
          await appendToNote(vaultUri, op.path, op.content);
        } else {
          await createNote(vaultUri, op.path, op.content);
        }
        atomsTouched.push(op.path);
        const parsed = parseNote(op.content, noteTitle(op.path));
        await upsertNote({
          id: op.path, title: parsed.title, tags: parsed.tags,
          aliases: parsed.aliases, summary: extractDensestParagraph(parsed.body),
          outlinks: parsed.outlinks, type: parsed.type, area: parsed.area,
          status: parsed.status, lastModified: Date.now(),
        });
        await upsertLinks(op.path, parsed.outlinks);
      }

      if (conversationFilePath && vaultUri) {
        await updateConversationMeta(vaultUri, conversationFilePath, true, atomsTouched).catch(() => {});
      }

      success = true;
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
      if (success) navigation.goBack();
    }
  };

  const hasNotes = decision.notes.length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={styles.heading}>Confirm Update</Text>

      <Card style={styles.card}>
        <Card.Title title="Reasoning" />
        <Card.Content>
          <Text variant="bodyMedium">{decision.reasoning}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Title
          title="Daily Note Entry"
          subtitle="Always written to daily/YYYY-MM-DD.md"
          right={() => <Chip compact style={styles.chip}>daily</Chip>}
        />
        <Card.Content>
          <Text variant="bodySmall" style={styles.code}>{decision.daily_entry}</Text>
        </Card.Content>
      </Card>

      {hasNotes ? (
        decision.notes.map((op, i) => (
          <Card key={op.path + i} style={styles.card}>
            <Card.Title
              title={noteTitle(op.path)}
              subtitle={op.path}
              right={() => (
                <Chip compact style={styles.chip}>
                  {op.action === 'create_atom' ? 'new atom' : 'update atom'}
                </Chip>
              )}
            />
            <Card.Content>
              <Text variant="bodySmall" style={styles.code}>{op.content}</Text>
            </Card.Content>
          </Card>
        ))
      ) : (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="bodySmall" style={{ color: '#6B7280' }}>
              No atom notes — daily note only.
            </Text>
          </Card.Content>
        </Card>
      )}

      <View style={styles.actions}>
        <Button mode="contained" onPress={handleApply} loading={loading} disabled={loading} style={styles.btn}>
          Apply
        </Button>
        <Button mode="outlined" onPress={() => navigation.goBack()} disabled={loading} style={styles.btn}>
          Discard
        </Button>
      </View>

      <Snackbar visible={!!errorMsg} onDismiss={() => setErrorMsg('')} duration={4000}>
        {errorMsg}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingTop: 60 },
  heading: { fontWeight: 'bold' },
  card: { borderRadius: 12 },
  chip: { marginRight: 12 },
  code: { fontFamily: 'monospace', color: '#333', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btn: { flex: 1 },
});
