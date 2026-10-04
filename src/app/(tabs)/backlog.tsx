import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openReader, PaperCard, paperMeta } from '@/components/paper-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { listArchive, listQueued, markRead, postpone } from '@/db/repos/papers';
import { listTopics } from '@/db/repos/topics';
import type { Paper, Topic } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

function PaperRow({ paper, topic, extra }: { paper: Paper; topic?: Topic; extra?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => openReader(paper)}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.rowSwatch, { backgroundColor: topic?.color ?? theme.border }]} />
      <View style={styles.rowText}>
        <ThemedText type="small" numberOfLines={2} style={styles.rowTitle}>
          {paper.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {extra ?? paperMeta(paper)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function BacklogScreen() {
  const db = useDb();
  const [view, setView] = useState<'queue' | 'archive'>('queue');
  const [topicId, setTopicId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [showRest, setShowRest] = useState(false);

  const load = useCallback(
    async (d: Db) => {
      const [topics, queue, archive] = await Promise.all([
        listTopics(d),
        listQueued(d, topicId),
        listArchive(d, search),
      ]);
      return { topics, queue, archive };
    },
    [topicId, search]
  );
  const data = useQuery(load);
  if (!data) return <ThemedView style={styles.container} />;
  const { topics, queue, archive } = data;
  const topicOf = (p: Paper) => topics.find((t) => t.id === p.topicId);
  const [top, ...rest] = queue;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText style={styles.headline}>Backlog</ThemedText>
            <Button label="+ Paper" variant="primary" onPress={() => router.push('/paper/new')} />
          </View>

          <Row>
            <Chip label="Warteschlange" selected={view === 'queue'} onPress={() => setView('queue')} />
            <Chip label="Archiv" selected={view === 'archive'} onPress={() => setView('archive')} />
          </Row>

          {view === 'queue' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row style={styles.noWrap}>
                  <Chip label="Alle" selected={topicId === null} onPress={() => setTopicId(null)} />
                  {topics.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.name}
                      color={t.color}
                      selected={topicId === t.id}
                      onPress={() => setTopicId(t.id)}
                    />
                  ))}
                </Row>
              </ScrollView>

              {top ? (
                <PaperCard paper={top} topic={topicOf(top)}>
                  <View style={styles.actions}>
                    <Button label="Gelesen" style={styles.flex} onPress={() => markRead(db, top.id)} />
                    <Button label="Später" style={styles.flex} onPress={() => postpone(db, top.id)} />
                  </View>
                </PaperCard>
              ) : (
                <ThemedText themeColor="textSecondary">
                  Nichts in der Warteschlange{topicId ? ' für dieses Thema' : ''}.
                </ThemedText>
              )}

              {rest.length > 0 && (
                <>
                  <Pressable onPress={() => setShowRest(!showRest)} style={styles.toggle}>
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {showRest ? '▾' : '▸'} Danach ({rest.length})
                    </ThemedText>
                  </Pressable>
                  {showRest && rest.map((p) => <PaperRow key={p.id} paper={p} topic={topicOf(p)} />)}
                </>
              )}
            </>
          ) : (
            <>
              <Field
                label="Suchen"
                value={search}
                onChangeText={setSearch}
                placeholder="Titel, Autor:innen oder Notiz"
                autoCorrect={false}
              />
              {archive.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  {search ? 'Nichts gefunden.' : 'Noch nichts gelesen.'}
                </ThemedText>
              ) : (
                archive.map((p) => (
                  <PaperRow
                    key={p.id}
                    paper={p}
                    topic={topicOf(p)}
                    extra={[
                      p.rating === 'up' ? '👍' : p.rating === 'down' ? '👎' : '',
                      p.readAt ? new Date(p.readAt).toLocaleDateString('de-DE') : '',
                      p.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                ))
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  noWrap: { flexWrap: 'nowrap' },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  toggle: { minHeight: 44, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    alignItems: 'center',
  },
  rowSwatch: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: 600 },
});
