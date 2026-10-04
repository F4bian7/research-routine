import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openUrl } from '@/components/link-button';
import { paperMeta } from '@/components/paper-card';
import { PaperContent } from '@/components/paper-content';
import { PaperNotes } from '@/components/paper-extras';
import { BrainButton } from '@/components/brain-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { paperSource } from '@/data/brain';
import { type Db, useDb } from '@/db/db';
import { deletePaper, getPaper, markRead, postpone, requeue, updatePaper } from '@/db/repos/papers';
import { listTopics } from '@/db/repos/topics';
import { useTheme } from '@/hooks/use-theme';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/backlog');
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const theme = useTheme();
  const load = useCallback(
    async (d: Db) => {
      const [paper, topics] = await Promise.all([getPaper(d, Number(id)), listTopics(d)]);
      return { paper, topic: topics.find((t) => t.id === paper?.topicId) };
    },
    [id]
  );
  const data = useQuery(load);
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!data) return <ThemedView style={styles.container} />;
  const { paper, topic } = data;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.back}>
            <ThemedText style={{ color: theme.accent }}>‹ Back</ThemedText>
          </Pressable>
          {paper?.url ? (
            <Pressable onPress={() => openUrl(paper.url)} hitSlop={12} style={styles.back}>
              <ThemedText style={{ color: theme.accent }}>Original ↗</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {!paper ? (
          <ThemedText style={styles.content}>This paper no longer exists.</ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {topic && (
              <View style={styles.topicRow}>
                <View style={[styles.swatch, { backgroundColor: topic.color }]} />
                <ThemedText type="small" themeColor="textSecondary">
                  {topic.name}
                </ThemedText>
              </View>
            )}
            <ThemedText style={styles.title}>{paper.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {paperMeta(paper)}
            </ThemedText>

            <Row>
              <Chip
                label="👍"
                selected={paper.rating === 'up'}
                onPress={() =>
                  updatePaper(db, paper.id, { rating: paper.rating === 'up' ? null : 'up' })
                }
              />
              <Chip
                label="👎"
                selected={paper.rating === 'down'}
                onPress={() =>
                  updatePaper(db, paper.id, { rating: paper.rating === 'down' ? null : 'down' })
                }
              />
            </Row>

            <PaperContent paper={paper} />

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <PaperNotes paper={paper} />

            <BrainButton source={() => (d: Db) => paperSource(d, paper)} />

            <Field
              label="Quick note (shown in the archive)"
              multiline
              value={note ?? paper.note}
              onChangeText={setNote}
              onBlur={() => {
                if (note !== null && note !== paper.note) updatePaper(db, paper.id, { note });
              }}
              placeholder="What do I take away?"
            />

            {paper.status === 'queued' ? (
              <View style={styles.actions}>
                <Button
                  label="Mark read"
                  variant="primary"
                  onPress={async () => {
                    if (note !== null) await updatePaper(db, paper.id, { note });
                    await markRead(db, paper.id);
                    goBack();
                  }}
                />
                <Button
                  label="Later"
                  onPress={async () => {
                    await postpone(db, paper.id);
                    goBack();
                  }}
                />
              </View>
            ) : (
              <Button label="Back to the queue" onPress={() => requeue(db, paper.id)} />
            )}

            <Button
              label={confirmDelete ? 'Really delete?' : 'Delete'}
              variant={confirmDelete ? 'danger' : 'ghost'}
              onPress={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                await deletePaper(db, paper.id);
                goBack();
              }}
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { minHeight: 44, justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  divider: { height: StyleSheet.hairlineWidth },
  actions: { gap: Spacing.two },
});
