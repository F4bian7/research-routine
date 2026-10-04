import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MathText } from '@/components/math-text';
import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { type BrainSource, keepNotes, pendingSource, suggestFor } from '@/data/brain';
import { useDb } from '@/db/db';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';

type Draft = { title: string; body: string; keep: boolean; editing: boolean };

const BRAIN = { pathname: '/brain', params: { view: 'notes' } } as const;

// Notes for the second brain, drafted by Gemini from what is being read: keep them as
// they are, edit or drop single ones, or add an own note.
export default function SuggestNotesScreen() {
  const db = useDb();
  const theme = useTheme();
  const [source, setSource] = useState<BrainSource | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'saved'>('loading');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const load = pendingSource();
    let alive = true;
    (async () => {
      try {
        if (!load) throw new Error('Nothing to take notes from. Open this from a paper, a feed item or a session.');
        const s = await load(db);
        if (!alive) return;
        setSource(s);
        const notes = await suggestFor(db, s);
        if (!alive) return;
        setDrafts(notes.map((n) => ({ ...n, keep: true, editing: false })));
        setStatus('ready');
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error && !('status' in e) ? e.message : explainError(e));
        setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, attempt]);

  const change = (i: number, d: Partial<Draft>) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, ...d } : x)));
  const kept = drafts.filter((d) => d.keep && (d.title.trim() || d.body.trim()));

  async function save() {
    if (!source) return;
    await keepNotes(
      db,
      source,
      kept.map((d) => ({ title: d.title.trim() || d.body.trim().slice(0, 60), body: d.body.trim() }))
    );
    setSaved(kept.length);
    setStatus('saved');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar
          left={{ label: status === 'saved' ? 'Close' : 'Cancel', onPress: () => goBack(BRAIN) }}
          title="To my brain"
          right={status === 'ready' && kept.length > 0 ? { label: 'Save', onPress: save, bold: true } : undefined}
        />
        <ScrollView contentContainerStyle={styles.content}>
          {source ? (
            <ThemedText type="small" themeColor="textSecondary">
              From: {source.title}
            </ThemedText>
          ) : null}

          {status === 'loading' && (
            <ThemedText style={{ color: theme.accent }}>
              Gemini is drafting notes with the ideas worth keeping …
            </ThemedText>
          )}

          {status === 'error' && (
            <View style={styles.box}>
              <ThemedText>{error}</ThemedText>
              {source ? (
                <>
                  <Button
                    label="Try again"
                    variant="primary"
                    onPress={() => {
                      setStatus('loading');
                      setAttempt((a) => a + 1);
                    }}
                  />
                  <Button
                    label="Write the note myself"
                    onPress={() => {
                      setDrafts([{ title: '', body: '', keep: true, editing: true }]);
                      setStatus('ready');
                    }}
                  />
                </>
              ) : null}
            </View>
          )}

          {status === 'ready' && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Uncheck what you do not want, tap a note to change it. Notes are linked to the
                paper, its topic and its authors you follow.
              </ThemedText>
              {drafts.map((d, i) => (
                <View
                  key={i}
                  style={[styles.card, { borderColor: d.keep ? theme.accent : theme.border, opacity: d.keep ? 1 : 0.5 }]}>
                  <View style={styles.topRow}>
                    <Pressable onPress={() => change(i, { keep: !d.keep })} hitSlop={10} accessibilityLabel="Keep">
                      <ThemedText style={[styles.check, { color: d.keep ? theme.accent : theme.textSecondary }]}>
                        {d.keep ? '☑' : '☐'}
                      </ThemedText>
                    </Pressable>
                    {d.editing ? null : (
                      <Pressable style={styles.flex} onPress={() => change(i, { editing: true })}>
                        <MathText text={d.title} style={styles.title} />
                      </Pressable>
                    )}
                  </View>
                  {d.editing ? (
                    <>
                      <Field label="Title" value={d.title} onChangeText={(t) => change(i, { title: t })} placeholder="The idea in one line" />
                      <Field
                        label="Note"
                        value={d.body}
                        onChangeText={(t) => change(i, { body: t })}
                        multiline
                        placeholder="In your own words. [[Another note]] links it."
                      />
                      <Button label="Done" variant="ghost" onPress={() => change(i, { editing: false })} />
                    </>
                  ) : (
                    <Pressable onPress={() => change(i, { editing: true })}>
                      <MathText text={d.body} style={styles.body} />
                      <ThemedText type="small" style={{ color: theme.accent }}>
                        Edit
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              ))}
              <Button
                label="+ Add my own note"
                variant="ghost"
                onPress={() => setDrafts((all) => [...all, { title: '', body: '', keep: true, editing: true }])}
              />
              <Button
                label={kept.length ? `Save ${kept.length} ${kept.length === 1 ? 'note' : 'notes'} to my brain` : 'Nothing selected'}
                variant="primary"
                disabled={kept.length === 0}
                onPress={save}
              />
            </>
          )}

          {status === 'saved' && (
            <View style={styles.box}>
              <ThemedText style={styles.big}>
                {saved} {saved === 1 ? 'note' : 'notes'} saved ✓
              </ThemedText>
              <Button label="Back" variant="primary" onPress={() => router.back()} />
              <Button label="Open my notes" onPress={() => router.replace(BRAIN)} />
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
  box: { gap: Spacing.three },
  card: { borderWidth: 1.5, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  check: { fontSize: 22, lineHeight: 24 },
  flex: { flex: 1 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: 700 },
  body: { fontSize: 16, lineHeight: 23 },
  big: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
});
