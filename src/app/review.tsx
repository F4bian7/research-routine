import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { sessionCards, XP } from '@/data/learn';
import { useDb } from '@/db/db';
import { saveReview } from '@/db/repos/cards';
import { logLearning } from '@/db/repos/learn';
import type { Card } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { type Grade, intervalLabel, nextInterval, review } from '@/domain/srs';
import { useTheme } from '@/hooks/use-theme';

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

type QueueItem = { card: Card; retry: boolean };

// Optional flashcard review (spaced repetition), separate from the daily session.
export default function ReviewScreen() {
  const db = useDb();
  const theme = useTheme();
  const [today] = useState(todayKey);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    sessionCards(db, today).then((cards) => alive && setQueue(cards.map((card) => ({ card, retry: false }))));
    return () => {
      alive = false;
    };
  }, [db, today]);

  async function grade(g: Grade) {
    if (!queue) return;
    const [current, ...rest] = queue;
    let count = reviewed;
    if (!current.retry) {
      await saveReview(db, current.card.id, review(current.card, g, today));
      count += 1;
      setReviewed(count);
    }
    const next = g === 'again' && !current.retry ? [...rest, { card: current.card, retry: true }] : rest;
    setQueue(next);
    setShowBack(false);
    if (next.length === 0) {
      await logLearning(db, today, count * XP.card, count, null);
      setDone(true);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar left={{ label: 'Close', onPress: () => goBack('/') }} title="Review cards" />
        <ScrollView contentContainerStyle={styles.content}>
          {queue === null ? null : done || queue.length === 0 ? (
            <View style={styles.done}>
              <ThemedText style={styles.big}>{done ? 'All reviewed' : 'Nothing due'}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {done
                  ? `${reviewed} ${reviewed === 1 ? 'card' : 'cards'} reviewed.`
                  : 'Cards come from your notes and papers (Brain → Cards). None is due today.'}
              </ThemedText>
              <Button label="Back" variant="primary" onPress={() => router.replace('/')} />
            </View>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {queue.filter((q) => !q.retry).length} left
              </ThemedText>
              <Pressable onPress={() => setShowBack(true)} style={[styles.flash, { borderColor: theme.border }]}>
                <ThemedText style={styles.front}>{queue[0].card.front}</ThemedText>
                {showBack ? (
                  <>
                    <View style={[styles.rule, { backgroundColor: theme.border }]} />
                    <ThemedText style={styles.back}>{queue[0].card.back}</ThemedText>
                  </>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Think of the answer, then tap.
                  </ThemedText>
                )}
              </Pressable>
              {showBack ? (
                <View style={styles.grades}>
                  {GRADES.map(({ grade: g, label }) => {
                    const strong = g === 'again' || g === 'good';
                    return (
                      <Pressable
                        key={g}
                        onPress={() => grade(g)}
                        style={({ pressed }) => [
                          styles.grade,
                          {
                            backgroundColor: g === 'again' ? '#D93F3F' : g === 'good' ? theme.accent : theme.backgroundSelected,
                            opacity: pressed ? 0.6 : 1,
                          },
                        ]}>
                        <ThemedText style={[styles.gradeLabel, { color: strong ? theme.onAccent : theme.text }]}>
                          {label}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: strong ? theme.onAccent : theme.textSecondary }}>
                          {queue[0].retry ? 'again' : intervalLabel(nextInterval(queue[0].card, g))}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Button label="Show answer" variant="primary" onPress={() => setShowBack(true)} />
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
  big: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  flash: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    minHeight: 220,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  front: { fontSize: 20, lineHeight: 28, fontWeight: 700 },
  back: { fontSize: 18, lineHeight: 26 },
  rule: { height: StyleSheet.hairlineWidth },
  grades: { flexDirection: 'row', gap: Spacing.two },
  grade: { flex: 1, borderRadius: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  gradeLabel: { fontWeight: 700 },
  done: { gap: Spacing.three, paddingTop: Spacing.five },
});
