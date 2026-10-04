import { useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LessonBody, QuizView } from '@/components/lesson-view';
import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import type { Db } from '@/db/db';
import { getLesson } from '@/db/repos/lessons';
import { listTopics } from '@/db/repos/topics';

// A finished lesson, to read again.
export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(
    async (d: Db) => {
      const lesson = await getLesson(d, Number(id));
      const topics = await listTopics(d);
      return { lesson, topic: topics.find((t) => t.id === lesson?.topicId) ?? null };
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
              {data.lesson.content?.quiz ? <QuizView quiz={data.lesson.content.quiz} onAnswer={() => {}} /> : null}
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
});
