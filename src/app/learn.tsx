import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LessonBody, QuizView } from '@/components/lesson-view';
import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { completeSession, finishLesson, getGemini, prepareLesson, sessionCards, XP } from '@/data/learn';
import { useDb } from '@/db/db';
import { saveReview } from '@/db/repos/cards';
import { getLearnDay, totalXp } from '@/db/repos/learn';
import type { Card, Lesson, Topic } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { type Grade, intervalLabel, nextInterval, review } from '@/domain/srs';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';

type LessonState =
  | { state: 'none' }
  | { state: 'loading' }
  | { state: 'ready'; lesson: Lesson; topic: Topic }
  | { state: 'error'; message: string };

type Phase = 'loading' | 'intro' | 'lesson' | 'quiz' | 'cards' | 'done';
type QueueItem = { card: Card; retry: boolean };

const TODAY = { pathname: '/' } as const;

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

export default function LearnScreen() {
  const db = useDb();
  const theme = useTheme();
  const [today] = useState(todayKey);
  const [phase, setPhase] = useState<Phase>('loading');
  const [lesson, setLesson] = useState<LessonState>({ state: 'none' });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [cardCount, setCardCount] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [xp, setXp] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [hasKey, setHasKey] = useState(false);
  const [total, setTotal] = useState(0);
  const [lessonDoneToday, setLessonDoneToday] = useState(false);

  // Gather the session: due and new cards right away, the lesson in the background
  // (writing it with Gemini takes a few seconds).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cards, day, gemini] = await Promise.all([
        sessionCards(db, today),
        getLearnDay(db, today),
        getGemini(db),
      ]);
      if (!alive) return;
      setQueue(cards.map((card) => ({ card, retry: false })));
      setCardCount(cards.length);
      setHasKey(!!gemini);
      setPhase('intro');
      if (day?.lessonId) {
        setLessonDoneToday(true); // this is extra practice
        return;
      }
      setLesson({ state: 'loading' });
      try {
        const got = await prepareLesson(db);
        if (alive) setLesson(got ? { state: 'ready', ...got } : { state: 'none' });
      } catch (e) {
        if (alive) setLesson({ state: 'error', message: explainError(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, today]);

  async function finish(gained: number, reviewedNow: number) {
    await completeSession(db, today, {
      xp: gained,
      reviewed: reviewedNow,
      lessonId: lesson.state === 'ready' ? lesson.lesson.id : null,
    });
    setTotal(await totalXp(db));
    setPhase('done');
  }

  async function afterLesson() {
    if (lesson.state === 'ready') await finishLesson(db, lesson.lesson);
    // The lesson's own flashcards join the queue as new cards.
    const cards = await sessionCards(db, today);
    const known = new Set(queue.map((q) => q.card.id));
    const extra = cards.filter((c) => !known.has(c.id)).map((card) => ({ card, retry: false }));
    const next = [...queue, ...extra];
    setQueue(next);
    setCardCount(cardCount + extra.length);
    if (next.length) setPhase('cards');
    else await finish(xp, reviewed);
  }

  async function grade(g: Grade) {
    const [current, ...rest] = queue;
    let gained = xp;
    let count = reviewed;
    if (!current.retry) {
      await saveReview(db, current.card.id, review(current.card, g, today));
      gained += XP.card;
      count += 1;
      setXp(gained);
      setReviewed(count);
    }
    // A missed card comes back once at the end of the session.
    const next = g === 'again' && !current.retry ? [...rest, { card: current.card, retry: true }] : rest;
    setQueue(next);
    setShowBack(false);
    if (next.length === 0) await finish(gained, count);
  }

  const lessonReady = lesson.state === 'ready';
  const nothing = phase === 'intro' && cardCount === 0 && (lesson.state === 'none' || lesson.state === 'error');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar
          left={{ label: phase === 'done' ? 'Close' : 'Stop', onPress: () => goBack(TODAY) }}
          title="Today's session"
        />
        <ScrollView contentContainerStyle={styles.content}>
          {phase === 'loading' && <ThemedText themeColor="textSecondary">Getting ready …</ThemedText>}

          {phase === 'intro' && !nothing && (
            <>
              <ThemedText style={styles.big}>About 5 minutes</ThemedText>
              <ThemedView type="backgroundElement" style={styles.panel}>
                <ThemedText>
                  {lesson.state === 'ready'
                    ? `📖 New lesson: ${lesson.lesson.title}`
                    : lesson.state === 'loading'
                      ? '📖 Gemini is writing today’s lesson …'
                      : lesson.state === 'error'
                        ? `📖 No lesson today. ${lesson.message}`
                        : lessonDoneToday
                          ? '📖 Today’s lesson is done.'
                          : hasKey
                            ? '📖 No lesson today: add a topic in Brain → Topics.'
                            : '📖 No lesson: lessons need the free Gemini key (Settings).'}
                </ThemedText>
                <ThemedText>
                  🔁 {cardCount} {cardCount === 1 ? 'card' : 'cards'} to review
                </ThemedText>
              </ThemedView>
              <Button
                label={lesson.state === 'loading' ? 'Preparing …' : 'Start'}
                variant="primary"
                disabled={lesson.state === 'loading'}
                onPress={() => setPhase(lessonReady ? 'lesson' : 'cards')}
              />
              {lesson.state === 'loading' && cardCount > 0 && (
                <Button label="Start with the cards" variant="ghost" onPress={() => setPhase('cards')} />
              )}
            </>
          )}

          {nothing && (
            <>
              <ThemedText style={styles.big}>
                {lesson.state === 'error' ? 'The lesson could not be written' : 'Nothing to learn yet'}
              </ThemedText>
              {lesson.state === 'error' ? (
                <>
                  <ThemedText>{lesson.message}</ThemedText>
                  <Button label="Try again" variant="primary" onPress={() => router.replace('/learn')} />
                </>
              ) : null}
              <ThemedText themeColor="textSecondary">
                {lesson.state === 'error'
                  ? 'If it keeps failing, open Settings and tap "Test key"; the app then looks for a Gemini model that works with your key.'
                  : hasKey
                  ? 'Plan a course for a topic in Brain → Cards, or turn notes and papers into flashcards.'
                  : 'Daily lessons are written by Gemini: add the free key in Settings. Flashcards from your notes work without it.'}
              </ThemedText>
              <Button
                label={hasKey ? 'Open Cards' : 'Open Settings'}
                variant="primary"
                onPress={() =>
                  router.replace(hasKey ? { pathname: '/brain', params: { view: 'cards' } } : '/settings')
                }
              />
              <Button label="Count today anyway" variant="ghost" onPress={() => finish(0, 0)} />
            </>
          )}

          {phase === 'lesson' && lessonReady && (
            <>
              <LessonBody lesson={lesson.lesson} topic={lesson.topic} />
              <Button
                label="Continue"
                variant="primary"
                onPress={() => {
                  setXp(xp + XP.lesson);
                  setPhase(lesson.lesson.content?.quiz ? 'quiz' : 'cards');
                }}
              />
            </>
          )}

          {phase === 'quiz' && lessonReady && lesson.lesson.content && (
            <>
              <QuizView
                quiz={lesson.lesson.content.quiz}
                onAnswer={(right) => {
                  setQuizDone(true);
                  if (right) setXp((x) => x + XP.quizRight);
                }}
              />
              {quizDone && <Button label="Continue" variant="primary" onPress={afterLesson} />}
            </>
          )}

          {phase === 'cards' && queue.length > 0 && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {queue.filter((q) => !q.retry).length} left
                {queue.some((q) => q.retry) ? ` · ${queue.filter((q) => q.retry).length} to repeat` : ''}
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
                  {GRADES.map(({ grade: g, label }) => (
                    <Pressable
                      key={g}
                      onPress={() => grade(g)}
                      style={({ pressed }) => [
                        styles.grade,
                        { backgroundColor: g === 'again' ? '#D93F3F' : g === 'good' ? theme.accent : theme.backgroundSelected, opacity: pressed ? 0.6 : 1 },
                      ]}>
                      <ThemedText style={[styles.gradeLabel, { color: g === 'again' || g === 'good' ? theme.onAccent : theme.text }]}>
                        {label}
                      </ThemedText>
                      <ThemedText type="small" style={{ color: g === 'again' || g === 'good' ? theme.onAccent : theme.textSecondary }}>
                        {queue[0].retry ? 'again' : intervalLabel(nextInterval(queue[0].card, g))}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Button label="Show answer" variant="primary" onPress={() => setShowBack(true)} />
              )}
            </>
          )}

          {phase === 'cards' && queue.length === 0 && (
            <Button label="Finish" variant="primary" onPress={() => finish(xp, reviewed)} />
          )}

          {phase === 'done' && (
            <View style={styles.done}>
              <ThemedText style={styles.trophy}>🎉</ThemedText>
              <ThemedText style={styles.big}>Session done</ThemedText>
              <ThemedText themeColor="textSecondary">
                +{xp} XP · {reviewed} {reviewed === 1 ? 'card' : 'cards'} reviewed · {total} XP in total
              </ThemedText>
              <Button label="Back to Today" variant="primary" onPress={() => router.replace(TODAY)} />
            </View>
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
  panel: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
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
  done: { alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.five },
  trophy: { fontSize: 64, lineHeight: 76 },
});
