import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getGemini } from '@/data/learn';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { cardCounts, deleteCard, listCards, updateCard } from '@/db/repos/cards';
import { addSyllabus, deleteSyllabus, listLessons } from '@/db/repos/lessons';
import { getSettings } from '@/db/repos/settings';
import type { Card, Lesson, Topic } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { intervalLabel } from '@/domain/srs';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';
import { makeSyllabus } from '@/sources/learning';

async function load(db: Db) {
  const [counts, suggested, active, lessons, settings] = await Promise.all([
    cardCounts(db, todayKey()),
    listCards(db, 'suggested'),
    listCards(db, 'active'),
    listLessons(db),
    getSettings(db),
  ]);
  return { counts, suggested, active, lessons, hasKey: !!settings.geminiApiKey, focusId: settings.focusTopicId };
}

function SuggestedCard({ card }: { card: Card }) {
  const db = useDb();
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText style={styles.bold}>{card.front}</ThemedText>
      <ThemedText themeColor="textSecondary">{card.back}</ThemedText>
      <Row>
        <Button label="Keep" variant="primary" onPress={() => updateCard(db, card.id, { status: 'active' })} />
        <Button
          label="Edit"
          onPress={() => router.push({ pathname: '/card/edit', params: { id: String(card.id) } })}
        />
        <Button label="Discard" variant="ghost" onPress={() => deleteCard(db, card.id)} />
      </Row>
    </View>
  );
}

// One topic's course: plan it, see the lessons, reread finished ones.
function CourseCard({ topic, lessons, hasKey }: { topic: Topic; lessons: Lesson[]; hasKey: boolean }) {
  const db = useDb();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState('');
  const [justPlanned, setJustPlanned] = useState(false);
  const [open, setOpen] = useState(false);
  const done = lessons.filter((l) => l.status === 'done');
  const next = lessons.find((l) => l.status === 'planned');

  // Planning takes a few seconds up to half a minute; show that it is working.
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function plan() {
    const g = await getGemini(db);
    if (!g) return setStatus('Add the free Gemini key in Settings first.');
    setSeconds(0);
    setBusy(true);
    setStatus('');
    try {
      await addSyllabus(db, topic.id, await makeSyllabus(g, topic));
      setJustPlanned(true);
      setOpen(true);
    } catch (e) {
      setStatus(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <Pressable onPress={() => lessons.length > 0 && setOpen(!open)} style={styles.topRow}>
        <View style={[styles.dot, { backgroundColor: topic.color }]} />
        <ThemedText style={[styles.bold, styles.flex]}>{topic.name}</ThemedText>
        {lessons.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {done.length}/{lessons.length} {open ? '▾' : '▸'}
          </ThemedText>
        )}
      </Pressable>

      {lessons.length === 0 ? (
        hasKey ? (
          <>
            <Button
              label={busy ? `Gemini is planning the course … ${seconds} s` : 'Plan the course now'}
              variant="primary"
              disabled={busy}
              onPress={plan}
            />
            {busy && (
              <ThemedText type="small" themeColor="textSecondary">
                This takes up to half a minute. You can stay here.
              </ThemedText>
            )}
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Courses are written by Gemini. Add the free key in Settings.
          </ThemedText>
        )
      ) : (
        <>
          {justPlanned && (
            <ThemedText type="small" style={{ color: theme.success }}>
              Course planned: {lessons.length} lessons. The first one is part of your next session.
            </ThemedText>
          )}
          {next ? (
            <ThemedText type="small" themeColor="textSecondary">
              Next: {next.title}
            </ThemedText>
          ) : (
            <ThemedText type="small">Course finished.</ThemedText>
          )}
          {justPlanned && <Button label="Start the first lesson now" onPress={() => router.push('/learn')} />}
          {open &&
            lessons.map((l) =>
              l.status === 'done' ? (
                <Pressable
                  key={l.id}
                  onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: String(l.id) } })}
                  hitSlop={4}>
                  <ThemedText type="small" style={{ color: theme.accent }}>
                    ✓ {l.position}. {l.title}
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedText key={l.id} type="small" themeColor="textSecondary">
                  {l.position}. {l.title}
                </ThemedText>
              )
            )}
          {open && done.length === 0 && (
            <Pressable onPress={() => deleteSyllabus(db, topic.id)} hitSlop={4}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.underline}>
                Plan this course again
              </ThemedText>
            </Pressable>
          )}
        </>
      )}
      {status ? <ThemedText type="small" style={{ color: '#D93F3F' }}>{status}</ThemedText> : null}
    </View>
  );
}

export function CardsView({ topics }: { topics: Topic[] }) {
  const theme = useTheme();
  const data = useQuery(load);
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { counts, suggested, active, lessons, hasKey, focusId } = data;
  const focus = topics.find((t) => t.id === focusId);

  return (
    <View style={styles.box}>
      <ThemedView type="backgroundElement" style={styles.stats}>
        {[
          ['Due today', counts.due],
          ['New', counts.fresh],
          ['In review', counts.active],
        ].map(([label, n]) => (
          <View key={label} style={styles.stat}>
            <ThemedText style={styles.statNumber}>{n}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {label}
            </ThemedText>
          </View>
        ))}
      </ThemedView>
      <Button label="Start a session" variant="primary" onPress={() => router.push('/learn')} />

      {suggested.length > 0 && (
        <>
          <ThemedText type="smallBold">Suggested cards ({suggested.length})</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Drafted by Gemini from your papers and notes. Keep the ones worth remembering.
          </ThemedText>
          {suggested.map((c) => (
            <SuggestedCard key={c.id} card={c} />
          ))}
        </>
      )}

      <ThemedText type="smallBold">Courses</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Each topic gets a course of short lessons, from the basics to current research. One
        lesson comes in every daily session;{' '}
        {focus
          ? `right now all of them come from "${focus.name}" (switch the focus in Topics).`
          : 'topics take turns.'}
      </ThemedText>
      {topics.map((t) => (
        <CourseCard key={t.id} topic={t} lessons={lessons.filter((l) => l.topicId === t.id)} hasKey={hasKey} />
      ))}

      <Pressable onPress={() => setShowAll(!showAll)} hitSlop={8}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {showAll ? '▾' : '▸'} All cards in review ({active.length})
        </ThemedText>
      </Pressable>
      {showAll &&
        active.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => router.push({ pathname: '/card/edit', params: { id: String(c.id) } })}
            style={[styles.row, { borderBottomColor: theme.border }]}>
            <ThemedText style={styles.flex} numberOfLines={2}>
              {c.front}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {c.due ? `${c.due.slice(5)} · ${intervalLabel(Math.max(1, Math.round(c.intervalDays)))}` : 'new'}
            </ThemedText>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.three },
  stats: { flexDirection: 'row', borderRadius: Spacing.three, padding: Spacing.three },
  stat: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  bold: { fontWeight: 700 },
  underline: { textDecorationLine: 'underline' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
