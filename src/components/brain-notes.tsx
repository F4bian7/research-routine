import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { filesSupported, saveFile } from '@/data/files';
import { exportVault } from '@/data/obsidian';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { listNotes } from '@/db/repos/notes';
import type { Topic } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { useTheme } from '@/hooks/use-theme';

export function NotesView({ topics }: { topics: Topic[] }) {
  const db = useDb();
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback((d: Db) => listNotes(d, search), [search]);
  const notes = useQuery(load) ?? [];

  async function exportObsidian() {
    setStatus('Packing …');
    try {
      await saveFile(`research-brain-${todayKey()}.zip`, 'application/zip', await exportVault(db));
      setStatus('');
    } catch {
      setStatus('The export failed.');
    }
  }

  return (
    <View style={styles.box}>
      <ThemedText type="small" themeColor="textSecondary">
        Your second brain: one idea per note, linked to papers, people and topics. Save a
        highlight or an insight while reading, write [[Title of another note]] to connect
        notes, and turn notes into flashcards so they stick.
      </ThemedText>
      <Field
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Words in title, text or quote"
        autoCorrect={false}
      />
      {notes.length === 0 ? (
        <ThemedText themeColor="textSecondary">
          {search
            ? 'No note matches.'
            : 'No notes yet. Open a paper and tap "Add insight", or mark a passage in the full text.'}
        </ThemedText>
      ) : (
        notes.map((n) => {
          const colors = n.topicIds.map((id) => topics.find((t) => t.id === id)?.color).filter(Boolean);
          return (
            <Pressable
              key={n.id}
              onPress={() => router.push({ pathname: '/note/[id]', params: { id: String(n.id) } })}
              style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
              <View style={styles.flex}>
                <ThemedText style={styles.bold} numberOfLines={1}>
                  {n.title}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {n.quote ? `“${n.quote}”` : n.body || ' '}
                </ThemedText>
              </View>
              <View style={styles.dots}>
                {colors.map((c, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: c }]} />
                ))}
              </View>
            </Pressable>
          );
        })
      )}
      {filesSupported && (
        <>
          <Button label="Export for Obsidian" onPress={exportObsidian} />
          <ThemedText type="small" themeColor="textSecondary">
            A .zip with one Markdown file per note, paper, person and topic, all linked. Unpack
            it into an Obsidian vault to see your notes as a graph on any device.
          </ThemedText>
          {status ? <ThemedText type="small">{status}</ThemedText> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: 700 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
