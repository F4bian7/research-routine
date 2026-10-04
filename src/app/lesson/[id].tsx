import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrainButton } from '@/components/brain-button';
import { Checks, LessonBody } from '@/components/lesson-view';
import { lessonSource } from '@/data/brain';
import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import type { Db } from '@/db/db';
import { getLesson, listExplorations } from '@/db/repos/lessons';
import { listTopics } from '@/db/repos/topics';
import { useTheme } from '@/hooks/use-theme';

// A finished lesson with everything explored from it, to reread and continue.
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const load = useCallback(
    async (d: Db) => {
      const lesson = await getLesson(d, Number(id));
      const [topics, explorations] = await Promise.all([
        listTopics(d),
        lesson ? listExplorations(d, lesson.id) : [],
      ]);
      return { lesson, explorations, topic: topics.find((t) => t.id === lesson?.topicId) ?? null };
    },
    [id]
  );
  const data = useQuery(load);
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar left={{ label: '‹ Back', onPress: () => goBack({ pathname: '/brain', params: { view: 'cards' } }) }} />
        <ScrollView contentContainerStyle={styles.content}>
          {!data ? null : !data.lesson ? (
            <ThemedText>This lesson no longer exists.</ThemedText>
          ) : (
            <>
              <LessonBody lesson={data.lesson} topic={data.topic} />
              <Checks lesson={data.lesson} onAnswer={() => {}} />
              {data.explorations.map((e) => (
                <View key={e.id} style={[styles.block, { borderTopColor: theme.border }]}>
                  <LessonBody lesson={e} />
                </View>
              ))}
              <BrainButton source={() => lessonSource([data.lesson!, ...data.explorations])} />
              <Button
                label="Continue exploring from here"
                variant="primary"
                onPress={() => router.push({ pathname: '/learn', params: { lesson: String(data.lesson!.id) } })}
              />
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
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  block: { gap: Spacing.three, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
