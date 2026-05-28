import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Text, TextInput } from 'react-native-paper';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  status: string;
  statusColor?: string;
  editable?: boolean;
};

export function TranscriptDisplay({ value, onChangeText, status, statusColor = '#555', editable = true }: Props) {
  return (
    <View style={styles.container}>
      <Chip style={[styles.chip, { borderColor: statusColor }]} textStyle={{ color: statusColor }}>
        {status}
      </Chip>
      <TextInput
        mode="outlined"
        multiline
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder="Tap the mic and start speaking — or type here"
        style={styles.input}
        contentStyle={styles.inputContent}
        outlineStyle={styles.outline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', paddingHorizontal: 20, gap: 12 },
  chip: { alignSelf: 'center', backgroundColor: 'transparent' },
  input: { flex: 1, backgroundColor: '#F5F5F5' },
  inputContent: { fontSize: 16, lineHeight: 24, paddingTop: 12 },
  outline: { borderRadius: 12 },
});
