import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LinkButton } from '@/components/link-button';
import { PaperCard } from '@/components/paper-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { WeekDots } from '@/components/week-dots';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { MAX_NEW_CARDS, MAX_REVIEWS, peekLesson } from '@/data/learn';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { cardCounts } from '@/db/repos/cards';
import { listCompletions } from '@/db/repos/completions';
import { getLearnDay, isRoutineDone, setRoutineDone, totalXp } from '@/db/repos/learn';
import { topQueued } from '@/db/repos/papers';
import { listRoutine } from '@/db/repos/routine';
import { getSettings } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { QuickLink, TaskKind } from '@/db/types';
import { parseKey, todayKey, weekdayOf } from '@/domain/dates';
import { computeStreak, makeCountsRule } from '@/domain/streak';
import { useTheme } from '@/hooks/use-theme';
import type { FeedTab } from './feed';

// The in-app feed each task kind opens, and the external quick links it still offers
// for what the app cannot show (Scholar Inbox, X, alphaXiv).
const KIND_FEED: Record<TaskKind, { tab: FeedTab; label: string } | null> = {
  inbox: { tab: 'new', label: 'Open new papers' },
  inbox_backlog: { tab: 'new', label: 'Open new papers' },
  backlog: null,
  social: { tab: 'people', label: 'Open people feed' },
  trending: { tab: 'trending', label: 'Open trending papers' },
  custom: null,
};
const KIND_LINKS: Record<TaskKind, string[]> = {
  inbox: ['scholarInbox'],
  inbox_backlog: ['scholarInbox'],
  backlog: [],
  social: ['x'],
  trending: ['alphaxiv'],
  custom: [],
};

async function loadToday(db: Db) {
  const today = todayKey();
  const [routine, settings, completions, topics, routineDone, learnDay, xp, counts, next] =
    await Promise.all([
      listRoutine(db),
      getSettings(db),
      listCompletions(db),
      listTopics(db),
      isRoutineDone(db, today),
      getLearnDay(db, today),
      totalXp(db),
      cardCounts(db, today),
      peekLesson(db, false),
    ]);
  const task = routine.find((t) => t.weekday === weekdayOf(today)) ?? null;
  let paper = null;
  if (task?.kind === 'backlog') paper = await topQueued(db);
  if (task?.kind === 'inbox_backlog') paper = await topQueued(db, ['survey', 'milestone']);

  // The streak follows the daily Learn session.
  const done = new Set(completions.map((c) => c.date));
  const enabled = Object.fromEntries(routine.map((t) => [t.weekday, t.enabled]));
  const streak = computeStreak(done, makeCountsRule(enabled, settings.weekendCounts), today);
  const links = (task ? KIND_LINKS[task.kind] : [])
    .map((id) => settings.quickLinks.find((l) => l.id === id))
    .filter((l): l is QuickLink => !!l);
  const topic = topics.find((t) => t.id === paper?.topicId);

  return {
    today,
    task,
    paper,
    topic,
    done,
    streak,
    links,
    routineDone,
    learnDay,
    xp,
    counts,
    nextLesson: next.lesson,
    hasKey: !!settings.geminiApiKey,
    hasTopics: topics.length > 0,
  };
}

export default function TodayScreen() {
  const db = useDb();
  const theme = useTheme();
  const data = useQuery(loadToday);

  if (!data) return <ThemedView style={styles.container} />;
  const { today, task, paper, topic, done, streak, links, routineDone, learnDay, xp, counts } = data;
  const learned = done.has(today);
  const dateLabel = parseKey(today).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const reviews = Math.min(counts.due, MAX_REVIEWS) + Math.min(counts.fresh, MAX_NEW_CARDS);
  const lessonLine = data.nextLesson
    ? `New lesson: ${data.nextLesson.title}`
    : data.hasKey && data.hasTopics
      ? 'A new lesson from your topics'
      : 'Lessons need the free Gemini key (Settings)';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              {dateLabel}
            </ThemedText>
            <ThemedText style={styles.headline}>Today</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={styles.streakBox}>
            <View style={styles.streakRow}>
              <ThemedText style={styles.streakNumber}>{streak}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.flex}>
                day streak
              </ThemedText>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {xp} XP
              </ThemedText>
            </View>
            <WeekDots today={today} done={done} />
          </ThemedView>

          <ThemedView
            type="backgroundElement"
            style={[styles.card, { borderColor: learned ? theme.success : theme.accent, borderWidth: 2 }]}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
              Learn · keeps your streak
            </ThemedText>
            {learned ? (
              <>
                <ThemedText style={styles.taskTitle}>Session done ✓</ThemedText>
                <ThemedText themeColor="textSecondary">
                  +{learnDay?.xp ?? 0} XP today · {learnDay?.reviewed ?? 0}{' '}
                  {learnDay?.reviewed === 1 ? 'card' : 'cards'} reviewed
                </ThemedText>
                <Button label="Practice more" onPress={() => router.push('/learn')} />
              </>
            ) : (
              <>
                <ThemedText style={styles.taskTitle}>Today&apos;s session</ThemedText>
                <ThemedText themeColor="textSecondary">📖 {lessonLine}</ThemedText>
                <ThemedText themeColor="textSecondary">
                  🔁 {reviews} {reviews === 1 ? 'card' : 'cards'} to review · about 5 min
                </ThemedText>
                <Pressable
                  onPress={() => router.push('/learn')}
                  style={({ pressed }) => [
                    styles.mainButton,
                    { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={[styles.mainButtonText, { color: theme.onAccent }]}>Start</ThemedText>
                </Pressable>
              </>
            )}
          </ThemedView>

          {task && task.enabled ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
                Routine · bonus
              </ThemedText>
              <ThemedText style={styles.taskTitle}>{task.title}</ThemedText>
              {task.description ? (
                <ThemedText themeColor="textSecondary">{task.description}</ThemedText>
              ) : null}
              <ThemedText type="small" themeColor="textSecondary">
                about {task.durationMin} min
              </ThemedText>

              {task.kind && KIND_FEED[task.kind] ? (
                <Button
                  label={KIND_FEED[task.kind]!.label}
                  onPress={() =>
                    router.navigate({ pathname: '/feed', params: { tab: KIND_FEED[task.kind]!.tab } })
                  }
                />
              ) : null}
              {links.map((l) => (
                <LinkButton key={l.id} label={l.label} url={l.url} />
              ))}

              {(task.kind === 'backlog' || task.kind === 'inbox_backlog') &&
                (paper ? (
                  <PaperCard paper={paper} topic={topic} />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    The backlog is empty.
                  </ThemedText>
                ))}

              <Pressable
                onPress={() => setRoutineDone(db, today, !routineDone)}
                style={({ pressed }) => [
                  styles.routineButton,
                  {
                    backgroundColor: routineDone ? theme.success : 'transparent',
                    borderColor: routineDone ? theme.success : theme.accent,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText style={{ color: routineDone ? theme.onAccent : theme.accent, fontWeight: 700 }}>
                  {routineDone ? 'Done ✓ (tap to undo)' : 'Mark as done'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { gap: Spacing.half, marginTop: Spacing.two },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  streakBox: { borderRadius: Spacing.four, padding: Spacing.three, gap: Spacing.three },
  streakRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  streakNumber: { fontSize: 40, lineHeight: 46, fontWeight: 700 },
  card: { borderRadius: Spacing.four, padding: Spacing.four, gap: Spacing.three },
  taskTitle: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  mainButton: {
    alignSelf: 'stretch',
    minHeight: 60,
    borderRadius: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainButtonText: { fontSize: 20, fontWeight: 700 },
  flex: { flex: 1 },
  label: { fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  routineButton: {
    minHeight: 48,
    borderWidth: 1.5,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
