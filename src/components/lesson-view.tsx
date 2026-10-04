import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Lesson, Quiz, Topic } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

export function LessonBody({ lesson, topic }: { lesson: Lesson; topic?: Topic | null }) {
  const content = lesson.content;
  return (
    <View style={styles.box}>
      {topic ? (
        <View style={styles.topic}>
          <View style={[styles.dot, { backgroundColor: topic.color }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {topic.name} · lesson {lesson.position}
          </ThemedText>
        </View>
      ) : null}
      <ThemedText style={styles.title}>{lesson.title}</ThemedText>
      {content?.body.split(/\n\s*\n/).map((p, i) => (
        <ThemedText key={i} style={styles.paragraph}>
          {p.trim()}
        </ThemedText>
      ))}
      {content && content.keyPoints.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.points}>
          <ThemedText type="smallBold">Key points</ThemedText>
          {content.keyPoints.map((k, i) => (
            <ThemedText key={i}>• {k}</ThemedText>
          ))}
        </ThemedView>
      )}
    </View>
  );
}

// One multiple-choice question; `onAnswer` fires once with whether it was right.
export function QuizView({ quiz, onAnswer }: { quiz: Quiz; onAnswer: (right: boolean) => void }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <View style={styles.box}>
      <ThemedText style={styles.question}>{quiz.question}</ThemedText>
      {quiz.options.map((o, i) => {
        const answered = picked !== null;
        const right = i === quiz.answer;
        const color = !answered ? theme.border : right ? theme.success : i === picked ? '#D93F3F' : theme.border;
        return (
          <Pressable
            key={i}
            disabled={answered}
            onPress={() => {
              setPicked(i);
              onAnswer(i === quiz.answer);
            }}
            style={({ pressed }) => [styles.option, { borderColor: color, opacity: pressed ? 0.6 : 1 }]}>
            <ThemedText>{o}</ThemedText>
          </Pressable>
        );
      })}
      {picked !== null && (
        <ThemedText style={{ color: picked === quiz.answer ? theme.success : '#D93F3F', fontWeight: 700 }}>
          {picked === quiz.answer ? 'Right!' : 'Not quite.'}{' '}
          <ThemedText themeColor="text" style={styles.normal}>
            {quiz.explanation}
          </ThemedText>
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.three },
  topic: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  paragraph: { fontSize: 17, lineHeight: 26 },
  points: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  question: { fontSize: 19, lineHeight: 26, fontWeight: 700 },
  option: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, minHeight: 52, justifyContent: 'center' },
  normal: { fontWeight: 500 },
});
