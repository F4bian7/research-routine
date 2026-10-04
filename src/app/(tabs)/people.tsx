import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { listPeople } from '@/db/repos/people';
import { addTopic, deleteTopic, listTopics, updateTopic } from '@/db/repos/topics';
import type { Person, Topic } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#64748B'];

function TopicEditor({ topic }: { topic: Topic }) {
  const db = useDb();
  const theme = useTheme();
  const [name, setName] = useState(topic.name);
  const [keywords, setKeywords] = useState(topic.keywords);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = (patch: Partial<Topic>) => updateTopic(db, { ...topic, name, keywords, ...patch });

  return (
    <ThemedView type="backgroundElement" style={styles.section}>
      <Field label="Name" value={name} onChangeText={setName} onBlur={() => save({})} />
      <Field
        label="Keywords for the feed (comma-separated)"
        value={keywords}
        onChangeText={setKeywords}
        onBlur={() => save({})}
        multiline
        autoCapitalize="none"
      />
      <Row>
        {COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => save({ color: c })}
            style={[
              styles.color,
              { backgroundColor: c, borderColor: topic.color === c ? theme.text : 'transparent' },
            ]}
          />
        ))}
      </Row>
      <Button
        label={confirmDelete ? 'Really delete this topic?' : 'Delete topic'}
        variant={confirmDelete ? 'danger' : 'ghost'}
        onPress={() => (confirmDelete ? deleteTopic(db, topic.id) : setConfirmDelete(true))}
      />
    </ThemedView>
  );
}

function PersonRow({ person, topics }: { person: Person; topics: Topic[] }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/person/[id]', params: { id: String(person.id) } })}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.flex}>
        <ThemedText style={styles.bold}>{person.name}</ThemedText>
        {person.institution ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {person.institution}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.dots}>
        {person.topicIds.map((id) => {
          const t = topics.find((x) => x.id === id);
          return t ? <View key={id} style={[styles.dot, { backgroundColor: t.color }]} /> : null;
        })}
      </View>
      <ThemedText themeColor="textSecondary">›</ThemedText>
    </Pressable>
  );
}

async function load(db: Db) {
  const [topics, people] = await Promise.all([listTopics(db), listPeople(db)]);
  return { topics, people };
}

export default function TopicsScreen() {
  const db = useDb();
  const data = useQuery(load);
  const [view, setView] = useState<'topics' | 'people'>('topics');
  const [topicFilter, setTopicFilter] = useState<number | null>(null);
  if (!data) return <ThemedView style={styles.container} />;
  const { topics, people } = data;
  const shown = people.filter((p) => topicFilter === null || p.topicIds.includes(topicFilter));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText style={styles.headline}>{view === 'topics' ? 'Topics' : 'People'}</ThemedText>
            {view === 'topics' ? (
              <Button
                label="+ Topic"
                variant="primary"
                onPress={() =>
                  addTopic(db, {
                    name: 'New topic',
                    color: COLORS[topics.length % COLORS.length],
                    keywords: '',
                  })
                }
              />
            ) : (
              <Button label="+ Person" variant="primary" onPress={() => router.push('/person/edit')} />
            )}
          </View>

          <Row>
            <Chip label="Topics" selected={view === 'topics'} onPress={() => setView('topics')} />
            <Chip label={`People (${people.length})`} selected={view === 'people'} onPress={() => setView('people')} />
          </Row>

          {view === 'topics' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Keywords drive the New and Bluesky feeds. Words in one keyword must all appear, so
                &quot;EEG seizure&quot; finds papers with both words; put a phrase in quotes to match it
                exactly.
              </ThemedText>
              {topics.map((t) => (
                <TopicEditor key={t.id} topic={t} />
              ))}
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Researchers and groups you follow: their newest papers and Bluesky posts inside the
                app, and links to Scholar, Bluesky, X and their website.
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row style={styles.noWrap}>
                  <Chip label="All" selected={topicFilter === null} onPress={() => setTopicFilter(null)} />
                  {topics.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.name}
                      color={t.color}
                      selected={topicFilter === t.id}
                      onPress={() => setTopicFilter(t.id)}
                    />
                  ))}
                </Row>
              </ScrollView>
              {shown.length === 0 ? (
                <ThemedText themeColor="textSecondary">
                  {people.length === 0 ? 'Nobody yet. Add the first person with "+ Person".' : 'Nobody in this topic.'}
                </ThemedText>
              ) : (
                shown.map((p) => <PersonRow key={p.id} person={p} topics={topics} />)
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
  section: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  color: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  noWrap: { flexWrap: 'nowrap' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  bold: { fontWeight: 700 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
