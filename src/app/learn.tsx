import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrainButton } from '@/components/brain-button';
import { Checks, LessonBody, NextSteps } from '@/components/lesson-view';
import { lessonSource } from '@/data/brain';
import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  completeSession,
  exploreFrom,
  finishLesson,
  getGemini,
  markPaperRead,
  peekLesson,
  prepareLesson,
  XP,
} from '@/data/learn';
import { useDb } from '@/db/db';
import { getLesson, listExplorations } from '@/db/repos/lessons';
import { totalXp } from '@/db/repos/learn';
import { listTopics } from '@/db/repos/topics';
import type { Lesson, Topic } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';
import type { ExploreKind } from '@/sources/learning';

type Phase = 'loading' | 'empty' | 'learning' | 'done';

const TODAY = { pathname: '/' } as const;

// A session is a conversation with a tutor: the next lesson of the course, then as far
// deeper or broader as the learner wants, with understanding checks on the way. Any
// number of sessions a day; the first one keeps the streak.
// With `?lesson=<id>` it continues from an earlier lesson instead of the next one.
export default function LearnScreen() {
  const params = useLocalSearchParams<{ lesson?: string; n?: string }>();
  const db = useDb();
  const theme = useTheme();
  const [today] = useState(todayKey);
  const [phase, setPhase] = useState<Phase>('loading');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [blocks, setBlocks] = useState<Lesson[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [xp, setXp] = useState(0);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<number, number>());
  const scrollTo = useRef<number | null>(null);

  // The next lesson of the course (written by Gemini when it is due), or the lesson
  // given in the route with what was explored from it before.
  useEffect(() => {
    let alive = true;
    (async () => {
      const g = await getGemini(db);
      if (!alive) return;
      setHasKey(!!g);
      try {
        if (params.lesson) {
          const root = await getLesson(db, Number(params.lesson));
          if (!root) throw new Error('This lesson no longer exists.');
          const [earlier, topics] = await Promise.all([listExplorations(db, root.id), listTopics(db)]);
          if (!alive) return;
          setTopic(topics.find((t) => t.id === root.topicId) ?? null);
          setBlocks([root, ...earlier]);
          setPhase('learning');
          return;
        }
        const got = await prepareLesson(db);
        if (!alive) return;
        if (!got) return setPhase('empty');
        setTopic(got.topic);
        setBlocks([got.lesson]);
        setPhase('learning');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error && !('status' in e) ? e.message : explainError(e));
        setPhase('empty');
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, params.lesson, params.n]);

  async function go(kind: ExploreKind, target: string) {
    const root = blocks[0];
    setBusy(
      kind === 'question' ? 'Gemini is answering …' : kind === 'simpler' ? 'Gemini is explaining it again …' : `Gemini is writing about “${target}” …`
    );
    setError('');
    try {
      const block = await exploreFrom(db, root, kind, target);
      scrollTo.current = block.id;
      setBlocks((b) => [...b, block]);
      setXp((x) => x + XP.exploration);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }

  async function finish() {
    const root = blocks[0];
    await finishLesson(db, root);
    // A paper explained is a paper read: it goes to the library's archive.
    if (root.kind === 'paper' && root.paperUrl) await markPaperRead(db, root);
    const gained = xp + (root.status === 'done' && params.lesson ? 0 : XP.lesson);
    await completeSession(db, today, { xp: gained, reviewed: 0, lessonId: root.id });
    setXp(gained);
    setTotal(await totalXp(db));
    setNext((await peekLesson(db, true)).lesson?.title ?? null);
    setPhase('done');
  }

  const last = blocks[blocks.length - 1];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar
          left={{ label: phase === 'done' ? 'Close' : 'Stop', onPress: () => goBack(TODAY) }}
          title="Learn"
          right={phase === 'learning' ? { label: 'Finish', onPress: finish, bold: true } : undefined}
        />
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          onContentSizeChange={() => {
            const id = scrollTo.current;
            const y = id !== null ? positions.current.get(id) : undefined;
            if (y !== undefined) {
              scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
              scrollTo.current = null;
            }
          }}>
          {phase === 'loading' && (
            <ThemedText themeColor="textSecondary">
              {params.lesson
                ? 'Opening …'
                : 'Gemini is preparing the next paper. The very first time it also chooses your reading path, which takes up to a minute.'}
            </ThemedText>
          )}

          {phase === 'empty' && (
            <View style={styles.box}>
              <ThemedText style={styles.big}>{error ? 'The lesson could not be written' : 'No lesson to start'}</ThemedText>
              {error ? <ThemedText>{error}</ThemedText> : null}
              <ThemedText themeColor="textSecondary">
                {!hasKey
                  ? 'Lessons are written by Gemini: add the free key in Settings.'
                  : error
                    ? 'Try again in a minute. If it keeps failing, tap "Test key" in Settings.'
                    : 'Add a topic in Brain → Topics, or a study pack, to get a course.'}
              </ThemedText>
              {error ? <Button label="Try again" variant="primary" onPress={() => router.replace({ pathname: '/learn', params: { n: String(Date.now()) } })} /> : null}
              <Button label={hasKey ? 'Open Topics' : 'Open Settings'} onPress={() => router.replace(hasKey ? { pathname: '/brain', params: { view: 'topics' } } : '/settings')} />
            </View>
          )}

          {phase === 'learning' &&
            blocks.map((b) => (
              <View
                key={b.id}
                style={[styles.block, b !== blocks[0] && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                onLayout={(e) => positions.current.set(b.id, e.nativeEvent.layout.y)}>
                <LessonBody lesson={b} topic={b === blocks[0] ? topic : null} />
                <Checks lesson={b} onAnswer={(right) => right && setXp((x) => x + XP.quizRight)} />
              </View>
            ))}

          {phase === 'learning' && last && (
            <>
              <NextSteps lesson={last} busy={!!busy} onExplore={go} />
              {busy ? <ThemedText style={{ color: theme.accent }}>{busy}</ThemedText> : null}
              {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
              <BrainButton source={() => lessonSource(blocks)} />
              <Button label="Finish session" variant="primary" disabled={!!busy} onPress={finish} />
            </>
          )}

          {phase === 'done' && (
            <View style={styles.done}>
              <ThemedText style={styles.trophy}>🎉</ThemedText>
              <ThemedText style={styles.big}>Session done</ThemedText>
              <ThemedText themeColor="textSecondary">
                +{xp} XP · {blocks.length - 1} {blocks.length - 1 === 1 ? 'exploration' : 'explorations'} · {total} XP in total
              </ThemedText>
              <Button
                label={next ? `Next paper: ${next}` : 'Start another session'}
                variant="primary"
                onPress={() => router.replace({ pathname: '/learn', params: { n: String(Date.now()) } })}
              />
              <BrainButton source={() => lessonSource(blocks)} label="🧠 Notes from this session" />
              <Button label="Back to Today" onPress={() => router.replace(TODAY)} />
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
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  box: { gap: Spacing.three },
  block: { gap: Spacing.three, paddingTop: Spacing.three },
  big: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  error: { color: '#D93F3F' },
  done: { alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.five },
  trophy: { fontSize: 64, lineHeight: 76 },
});
