import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Snackbar, Text } from 'react-native-paper';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { appendToDailyNote, appendToNote, createNote, updateConversationMeta } from '@/services/vault/VaultWriter';
import { getIndex, saveIndex } from '@/services/indexer/IndexStore';
import { indexNote, tokenize } from '@/services/indexer/TFIDFIndexer';
import { indexLinks } from '@/services/indexer/GraphIndexer';
import { parseNote } from '@/services/vault/MarkdownParser';
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
      const index = getIndex();

      // Write daily entry
      const dailyPath = await appendToDailyNote(vaultUri, decision.daily_entry);
      const dailyParsed = parseNote(decision.daily_entry, noteTitle(dailyPath));
      index.notes[dailyPath] = { id: dailyPath, title: dailyParsed.title, tags: dailyParsed.tags, aliases: dailyParsed.aliases, summary: dailyParsed.summary, outlinks: dailyParsed.outlinks, type: 'daily', lastModified: Date.now() };
      indexNote(index, dailyPath, tokenize(dailyParsed.body));
      indexLinks(index, dailyPath, dailyParsed.outlinks);

      // Write atom if applicable
      if (decision.action === 'update_atom' && decision.target_note && decision.atom_content) {
        await appendToNote(vaultUri, decision.target_note, decision.atom_content);
        atomsTouched.push(decision.target_note);
        const parsed = parseNote(decision.atom_content, noteTitle(decision.target_note));
        index.notes[decision.target_note] = { id: decision.target_note, title: parsed.title, tags: parsed.tags, aliases: parsed.aliases, summary: parsed.summary, outlinks: parsed.outlinks, type: parsed.type, area: parsed.area, status: parsed.status, lastModified: Date.now() };
        indexNote(index, decision.target_note, tokenize(parsed.body));
        indexLinks(index, decision.target_note, parsed.outlinks);
      } else if (decision.action === 'create_atom' && decision.target_note && decision.atom_content) {
        await createNote(vaultUri, decision.target_note, decision.atom_content);
        atomsTouched.push(decision.target_note);
        const parsed = parseNote(decision.atom_content, noteTitle(decision.target_note));
        index.notes[decision.target_note] = { id: decision.target_note, title: parsed.title, tags: parsed.tags, aliases: parsed.aliases, summary: parsed.summary, outlinks: parsed.outlinks, type: parsed.type, area: parsed.area, status: parsed.status, lastModified: Date.now() };
        indexNote(index, decision.target_note, tokenize(parsed.body));
        indexLinks(index, decision.target_note, parsed.outlinks);
      }

      await saveIndex(index);

      // Mark conversation as saved if we have its file path
      if (conversationFilePath && vaultUri) {
        await updateConversationMeta(vaultUri, conversationFilePath, true /* extracted */, atomsTouched).catch(() => {});
      }

      success = true;
    } catch (e: any) {
      setErrorMsg(`Save failed: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
      if (success) navigation.goBack();
    }
  };

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

      {decision.atom_content ? (
        <Card style={styles.card}>
          <Card.Title
            title={decision.target_note ? noteTitle(decision.target_note) : 'Atom Note'}
            subtitle={decision.target_note}
            right={() => (
              <Chip compact style={styles.chip}>
                {decision.action === 'create_atom' ? 'new atom' : 'update atom'}
              </Chip>
            )}
          />
          <Card.Content>
            <Text variant="bodySmall" style={styles.code}>{decision.atom_content}</Text>
          </Card.Content>
        </Card>
      ) : null}

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
