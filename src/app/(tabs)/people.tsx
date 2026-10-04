import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { useDb } from '@/db/db';
import { addTopic, deleteTopic, listTopics, updateTopic } from '@/db/repos/topics';
import type { Topic } from '@/db/types';
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

export default function TopicsScreen() {
  const db = useDb();
  const topics = useQuery(listTopics);
  if (!topics) return <ThemedView style={styles.container} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText style={styles.headline}>Topics</ThemedText>
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
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Keywords drive the New and Bluesky feeds. Words in one keyword must all appear, so
            &quot;EEG seizure&quot; finds papers with both words; put a phrase in quotes to match it
            exactly.
          </ThemedText>
          {topics.map((t) => (
            <TopicEditor key={t.id} topic={t} />
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            People and groups you follow come in a later step.
          </ThemedText>
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
});
