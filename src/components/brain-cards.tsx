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
import { countExplorations, deletePlannedPath, listPath } from '@/db/repos/lessons';
import { extendPath, planPath } from '@/data/paths';
import { getSettings } from '@/db/repos/settings';
import type { Card, Lesson, Topic } from '@/db/types';
import { todayKey } from '@/domain/dates';
import { intervalLabel } from '@/domain/srs';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';

async function load(db: Db) {
  const [counts, suggested, active, lessons, settings, explored] = await Promise.all([
    cardCounts(db, todayKey()),
    listCards(db, 'suggested'),
    listCards(db, 'active'),
    listPath(db),
    getSettings(db),
    countExplorations(db),
  ]);
  return { counts, suggested, active, lessons, hasKey: !!settings.geminiApiKey, focusId: settings.focusTopicId, explored };
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

// One topic's reading path: plan it, follow it from the foundations to today, reread
// finished papers, and add important new work later.
function PathCard({
  topic,
  lessons,
  hasKey,
  explored,
}: {
  topic: Topic;
  lessons: Lesson[];
  hasKey: boolean;
  explored: Map<number, number>;
}) {
  const db = useDb();
  const theme = useTheme();
  const [busy, setBusy] = useState<'' | 'plan' | 'extend'>('');
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const done = lessons.filter((l) => l.status === 'done');
  const next = lessons.find((l) => l.status === 'planned');

  // Planning takes up to a minute; show that it is working.
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  async function run(kind: 'plan' | 'extend') {
    const g = await getGemini(db);
    if (!g) return setStatus('Add the free Gemini key in Settings first.');
    setSeconds(0);
    setBusy(kind);
    setStatus('');
    try {
      const n = kind === 'plan' ? await planPath(db, g, topic) : await extendPath(db, g, topic);
      setStatus(
        kind === 'plan'
          ? `Reading path planned: ${n} papers, from the foundations to today.`
          : n
            ? `${n} important new ${n === 1 ? 'paper' : 'papers'} added at the end.`
            : 'Nothing new that clearly matters.'
      );
      setOpen(true);
    } catch (e) {
      setStatus(e instanceof Error && !('status' in e) ? e.message : explainError(e));
    } finally {
      setBusy('');
    }
  }

  let lastEra = '';
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
              label={busy ? `Choosing the papers … ${seconds} s` : 'Plan the reading path now'}
              variant="primary"
              disabled={!!busy}
              onPress={() => run('plan')}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {busy
                ? 'Searching the most cited papers and letting Gemini pick the ones that matter. Up to a minute.'
                : 'Otherwise it is planned at your first session on this topic.'}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Reading paths are chosen with Gemini. Add the free key in Settings.
          </ThemedText>
        )
      ) : (
        <>
          {next ? (
            <ThemedText type="small" themeColor="textSecondary">
              Next: {next.title}
              {next.paperMeta.year ? ` (${next.paperMeta.year})` : ''}
            </ThemedText>
          ) : (
            <ThemedText type="small">Path finished. Look for new important papers below.</ThemedText>
          )}
          {open &&
            lessons.map((l) => {
              const era = l.paperMeta.era ?? '';
              const header = era && era !== lastEra ? era : '';
              lastEra = era || lastEra;
              const label = `${l.position}. ${l.title}${l.paperMeta.year ? ` (${l.paperMeta.year})` : ''}`;
              return (
                <View key={l.id} style={styles.pathRow}>
                  {header ? (
                    <ThemedText type="smallBold" style={styles.era}>
                      {header}
                    </ThemedText>
                  ) : null}
                  {l.status === 'done' ? (
                    <Pressable
                      onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: String(l.id) } })}
                      hitSlop={4}>
                      <ThemedText type="small" style={{ color: theme.accent }}>
                        ✓ {label}
                        {explored.get(l.id) ? `  · ${explored.get(l.id)} explored` : ''}
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      {label}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          {open && hasKey && (
            <Button
              label={busy === 'extend' ? `Looking … ${seconds} s` : 'Look for new important papers'}
              variant="ghost"
              disabled={!!busy}
              onPress={() => run('extend')}
            />
          )}
          {open && done.length === 0 && (
            <Pressable onPress={() => deletePlannedPath(db, topic.id)} hitSlop={4}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.underline}>
                Plan this path again
              </ThemedText>
            </Pressable>
          )}
        </>
      )}
      {status ? (
        <ThemedText type="small" style={{ color: status.startsWith('Reading path') || status.includes('added') ? theme.success : theme.text }}>
          {status}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function CardsView({ topics }: { topics: Topic[] }) {
  const theme = useTheme();
  const data = useQuery(load);
  const [showAll, setShowAll] = useState(false);
  if (!data) return null;
  const { counts, suggested, active, lessons, hasKey, focusId, explored } = data;
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
      <Button label="Review flashcards" onPress={() => router.push('/review')} />
      <ThemedText type="small" themeColor="textSecondary">
        Flashcards are optional: they bring back facts from your notes and papers. Learning
        itself happens in the lessons below.
      </ThemedText>

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

      <ThemedText type="smallBold">Reading paths</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Each topic gets a path through its literature: the foundational papers everyone must
        know first, then the milestones, then today&apos;s state of the art. Every session explains
        the next paper;{' '}
        {focus
          ? `right now they all come from "${focus.name}" (switch the focus in Topics).`
          : 'topics take turns.'}
      </ThemedText>
      {topics.map((t) => (
        <PathCard
          key={t.id}
          topic={t}
          lessons={lessons.filter((l) => l.topicId === t.id)}
          hasKey={hasKey}
          explored={explored}
        />
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
  pathRow: { gap: 2 },
  era: { marginTop: Spacing.two, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
