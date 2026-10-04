import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getGemini } from '@/data/learn';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { addCards, cardsFor, deleteCard, updateCard } from '@/db/repos/cards';
import { notesForPaper } from '@/db/repos/notes';
import { listTopics } from '@/db/repos/topics';
import type { Paper } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';
import { cardsFromPaper } from '@/sources/learning';

// Notes about this paper, and the way in: "Add insight".
export function PaperNotes({ paper }: { paper: Paper }) {
  const theme = useTheme();
  const load = useCallback((d: Db) => notesForPaper(d, paper.id), [paper.id]);
  const notes = useQuery(load) ?? [];
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="smallBold" style={styles.heading}>
        My notes
      </ThemedText>
      {notes.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Write down what you take away, one idea per note. In the full text you can also mark a
          passage and save it as a highlight.
        </ThemedText>
      ) : (
        notes.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: String(n.id) } })}>
            <ThemedText style={{ color: theme.accent }}>{n.title}</ThemedText>
          </Pressable>
        ))
      )}
      <Button
        label="+ Add insight"
        variant="primary"
        onPress={() => router.push({ pathname: '/note/edit', params: { paperId: String(paper.id) } })}
      />
    </ThemedView>
  );
}

// Flashcards about this paper: Gemini drafts them, the user keeps what is worth it.
export function PaperCards({ paper, text }: { paper: Paper; text: string }) {
  const db = useDb();
  const theme = useTheme();
  const load = useCallback((d: Db) => cardsFor(d, 'paper_id', paper.id), [paper.id]);
  const cards = useQuery(load) ?? [];
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const fromPaper = cards.filter((c) => c.source === 'paper');

  async function suggest() {
    const g = await getGemini(db);
    if (!g) return setStatus('Add the free Gemini key in Settings first.');
    setBusy(true);
    setStatus('');
    try {
      const goal = (await listTopics(db)).find((t) => t.id === paper.topicId)?.goal;
      const drafts = await cardsFromPaper(g, { title: paper.title, text }, goal);
      await addCards(
        db,
        drafts.map((c) => ({
          ...c,
          source: 'paper' as const,
          status: 'suggested' as const,
          paperId: paper.id,
          topicId: paper.topicId,
        }))
      );
    } catch (e) {
      setStatus(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="smallBold" style={styles.heading}>
        Flashcards
      </ThemedText>
      {fromPaper.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          Let Gemini draft a few cards about this paper; kept cards come back in your daily
          session.
        </ThemedText>
      ) : (
        fromPaper.map((c) => (
          <View key={c.id} style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">{c.front}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {c.back}
            </ThemedText>
            {c.status === 'suggested' ? (
              <Row>
                <Button label="Keep" variant="primary" onPress={() => updateCard(db, c.id, { status: 'active' })} />
                <Button
                  label="Edit"
                  onPress={() => router.push({ pathname: '/card/edit', params: { id: String(c.id) } })}
                />
                <Button label="Discard" variant="ghost" onPress={() => deleteCard(db, c.id)} />
              </Row>
            ) : (
              <ThemedText type="small" style={{ color: theme.success }}>
                In your reviews
              </ThemedText>
            )}
          </View>
        ))
      )}
      <Button
        label={busy ? 'Gemini is writing …' : fromPaper.length ? 'Suggest more' : 'Suggest flashcards'}
        disabled={busy || !text}
        onPress={suggest}
      />
      {status ? <ThemedText type="small">{status}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  heading: { fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  card: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.one },
});
