import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StorageAccessFramework } from 'expo-file-system/legacy';

import { useVault } from '@/hooks/useVault';
import { loadCustomTools } from '@/services/tools/ToolRegistry';
import { BUILTIN_TOOL_DEFINITIONS } from '@/services/tools/BuiltinTools';
import { WEB_SEARCH_TOOL_DEFINITION } from '@/services/tools/WebSearchClient';
import { CALENDAR_TOOL_DEFINITIONS } from '@/services/tools/CalendarClient';
import type { RootStackParamList } from '@/navigation/AppNavigator';
import type { ToolDefinition } from '@/types';

type Nav = StackNavigationProp<RootStackParamList, 'Tools'>;

const ALL_BUILTIN: ToolDefinition[] = [
  ...BUILTIN_TOOL_DEFINITIONS,
  WEB_SEARCH_TOOL_DEFINITION,
  ...CALENDAR_TOOL_DEFINITIONS,
];

export function ToolsScreen() {
  const navigation = useNavigation<Nav>();
  const { vaultUri } = useVault();
  const [customTools, setCustomTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState('');

  const refresh = useCallback(async () => {
    if (!vaultUri) return;
    setLoading(true);
    try {
      const tools = await loadCustomTools(vaultUri);
      setCustomTools(tools);
    } catch {
      setSnack('Failed to load tools from vault.');
    } finally {
      setLoading(false);
    }
  }, [vaultUri]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDeleteTool = useCallback(async (tool: ToolDefinition) => {
    if (!vaultUri || !tool.sourcePath) return;
    try {
      const entries = await StorageAccessFramework.readDirectoryAsync(vaultUri);
      // Walk to the file and delete it
      const parts = tool.sourcePath.split('/');
      let dirUri = vaultUri;
      for (let i = 0; i < parts.length - 1; i++) {
        const found = entries.find(e =>
          decodeURIComponent(e.split('%2F').pop() ?? '') === parts[i],
        );
        if (!found) return;
        dirUri = found;
      }
      const fileName = parts[parts.length - 1];
      const allInDir = await StorageAccessFramework.readDirectoryAsync(dirUri);
      const fileUri = allInDir.find(e =>
        decodeURIComponent(e.split('%2F').pop() ?? '') === fileName,
      );
      if (fileUri) {
        await StorageAccessFramework.deleteAsync(fileUri);
        setSnack(`Deleted "${tool.name}".`);
        refresh();
      }
    } catch {
      setSnack('Failed to delete tool.');
    }
  }, [vaultUri, refresh]);

  const handleNewTool = useCallback(() => {
    // Navigate to conversation in tool_builder mode
    navigation.navigate('Conversation');
    // We rely on the user switching to tool_builder mode in the conversation screen
    // A future enhancement could auto-set the mode via route params
  }, [navigation]);

  const renderBuiltin = ({ item }: { item: ToolDefinition }) => (
    <View style={styles.toolCard}>
      <View style={styles.toolIcon}>
        <MaterialCommunityIcons name="cog" size={18} color="#6D28D9" />
      </View>
      <View style={styles.toolInfo}>
        <Text style={styles.toolName}>{item.name}</Text>
        <Text style={styles.toolDesc} numberOfLines={2}>{item.description}</Text>
      </View>
      <View style={styles.builtinBadge}>
        <Text style={styles.builtinBadgeText}>built-in</Text>
      </View>
    </View>
  );

  const renderCustom = ({ item }: { item: ToolDefinition }) => (
    <View style={styles.toolCard}>
      <View style={[styles.toolIcon, styles.toolIconCustom]}>
        <MaterialCommunityIcons name="puzzle" size={18} color="#059669" />
      </View>
      <View style={styles.toolInfo}>
        <Text style={styles.toolName}>{item.name}</Text>
        <Text style={styles.toolDesc} numberOfLines={2}>{item.description}</Text>
        {item.sourcePath && (
          <Text style={styles.toolPath}>{item.sourcePath}</Text>
        )}
      </View>
      <TouchableOpacity onPress={() => handleDeleteTool(item)} style={styles.deleteBtn}>
        <MaterialCommunityIcons name="delete-outline" size={18} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={() => (
          <>
            {/* New tool button */}
            <View style={styles.newToolRow}>
              <Button
                mode="contained"
                icon="plus"
                onPress={handleNewTool}
                style={styles.newToolBtn}
              >
                New Tool (Tool Builder)
              </Button>
            </View>

            {/* Built-in tools */}
            <Text style={styles.sectionHeader}>BUILT-IN TOOLS</Text>
            {ALL_BUILTIN.map(t => (
              <View key={t.name}>{renderBuiltin({ item: t })}</View>
            ))}

            {/* Custom tools */}
            <View style={styles.customHeader}>
              <Text style={styles.sectionHeader}>MY TOOLS</Text>
              <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
                <MaterialCommunityIcons name="refresh" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {loading && <ActivityIndicator style={styles.loader} color="#6D28D9" />}

            {!loading && customTools.length === 0 && (
              <View style={styles.emptyCustom}>
                <Text style={styles.emptyText}>No custom tools yet.</Text>
                <Text style={styles.emptySubText}>
                  Switch to Tool Builder mode in the conversation to create one.
                </Text>
              </View>
            )}

            {!loading && customTools.map(t => (
              <View key={t.name}>{renderCustom({ item: t })}</View>
            ))}
          </>
        )}
        keyExtractor={() => 'header'}
        contentContainerStyle={styles.listContent}
      />

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3000}>
        {snack}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  listContent: { padding: 16, paddingBottom: 40 },

  newToolRow: { marginBottom: 20 },
  newToolBtn: { alignSelf: 'flex-start' },

  sectionHeader: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#9CA3AF',
    textTransform: 'uppercase', marginBottom: 10, marginTop: 4,
  },
  customHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  refreshBtn: { padding: 4 },

  toolCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, marginBottom: 8, borderRadius: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    gap: 12,
  },
  toolIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center',
  },
  toolIconCustom: { backgroundColor: '#D1FAE5' },
  toolInfo: { flex: 1 },
  toolName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  toolDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  toolPath: { fontSize: 10, color: '#9CA3AF', marginTop: 3, fontFamily: 'monospace' },

  builtinBadge: {
    backgroundColor: '#EDE9FE', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  builtinBadgeText: { fontSize: 10, color: '#7C3AED', fontWeight: '600' },

  deleteBtn: { padding: 6 },

  loader: { marginTop: 20 },
  emptyCustom: { padding: 20, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  emptySubText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
});
