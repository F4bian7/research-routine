import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goBack, ScreenBar } from '@/components/screen-bar';
import { MathText } from '@/components/math-text';
import { ThemedText } from '@/components/themed-text';
import { hasMath } from '@/domain/math';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getGemini } from '@/data/learn';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { addCards, cardsFor } from '@/db/repos/cards';
import { getNote, listNotes } from '@/db/repos/notes';
import { getPaper } from '@/db/repos/papers';
import { listPeople } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import { backlinks, bodyWithoutTitle, findByTitle, splitLinks } from '@/domain/wikilinks';
import { useTheme } from '@/hooks/use-theme';
import { explainError } from '@/sources/gemini';
import { cardsFromNote } from '@/sources/learning';

const BRAIN = { pathname: '/brain', params: { view: 'notes' } } as const;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const load = useCallback(
    async (d: Db) => {
      const note = await getNote(d, Number(id));
      const [all, paper, topics, people, cards] = await Promise.all([
        listNotes(d),
        note?.paperId ? getPaper(d, note.paperId) : null,
        listTopics(d),
        listPeople(d),
        cardsFor(d, 'note_id', Number(id)),
      ]);
      return { note, all, paper, topics, people, cards };
    },
    [id]
  );
  const data = useQuery(load);
  if (!data) return <ThemedView style={styles.container} />;
  const { note, all, paper, topics, people, cards } = data;
  // Without an own title the first line is the title; it keeps its links there.
  const rest = note ? bodyWithoutTitle(note.body, note.title) : '';

  const renderLinks = (text: string, style: object) =>
    splitLinks(text).map((s, i) => {
      if ('text' in s) return hasMath(s.text) ? <MathText key={i} text={s.text} style={style} /> : s.text;
      const target = findByTitle(all, s.link);
      return (
        <ThemedText
          key={i}
          style={[style, { color: theme.accent, textDecorationLine: target ? 'none' : 'underline' }]}
          onPress={() =>
            target
              ? router.push({ pathname: '/note/[id]', params: { id: String(target.id) } })
              : router.push({ pathname: '/note/edit', params: { title: s.link } })
          }>
          {s.link}
        </ThemedText>
      );
    });

  async function suggestCards() {
    if (!note) return;
    const g = await getGemini(db, 'fast');
    if (!g) return setStatus('Add the free Gemini key in Settings first.');
    setBusy(true);
    setStatus('');
    try {
      const drafts = await cardsFromNote(g, note);
      await addCards(
        db,
        drafts.map((c) => ({
          ...c,
          source: 'note' as const,
          status: 'suggested' as const,
          noteId: note.id,
          paperId: note.paperId,
          topicId: note.topicIds[0] ?? null,
        }))
      );
    } catch (e) {
      setStatus(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScreenBar
          left={{ label: '‹ Back', onPress: () => goBack(BRAIN) }}
          right={
            note
              ? {
                  label: 'Edit',
                  onPress: () => router.push({ pathname: '/note/edit', params: { id: String(note.id) } }),
                }
              : undefined
          }
        />
        <ScrollView contentContainerStyle={styles.content}>
          {!note ? (
            <ThemedText>This note no longer exists.</ThemedText>
          ) : (
            <>
              <ThemedText style={styles.title}>
                {rest !== note.body ? renderLinks(note.body.trim().split('\n')[0], styles.title) : note.title}
              </ThemedText>
              {note.quote ? (
                <View style={[styles.quote, { borderLeftColor: theme.accent }]}>
                  <ThemedText style={styles.quoteText}>{note.quote}</ThemedText>
                </View>
              ) : null}
              {rest ? <ThemedText style={styles.body}>{renderLinks(rest, styles.body)}</ThemedText> : null}

              {paper ? (
                <Pressable
                  onPress={() => router.push({ pathname: '/paper/[id]', params: { id: String(paper.id) } })}
                  style={[styles.linkCard, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    From the paper
                  </ThemedText>
                  <ThemedText type="smallBold">{paper.title}</ThemedText>
                </Pressable>
              ) : null}

              <Row>
                {note.topicIds
                  .map((t) => topics.find((x) => x.id === t))
                  .filter((t) => !!t)
                  .map((t) => (
                    <Chip key={t!.id} label={t!.name} color={t!.color} selected={false} onPress={() => {}} />
                  ))}
                {note.personIds
                  .map((p) => people.find((x) => x.id === p))
                  .filter((p) => !!p)
                  .map((p) => (
                    <Chip
                      key={`p${p!.id}`}
                      label={p!.name}
                      selected={false}
                      onPress={() => router.push({ pathname: '/person/[id]', params: { id: String(p!.id) } })}
                    />
                  ))}
              </Row>

              {(() => {
                const back = backlinks(all, note.title);
                return back.length ? (
                  <View style={styles.section}>
                    <ThemedText type="smallBold">Linked from</ThemedText>
                    {back.map((n) => (
                      <Pressable
                        key={n.id}
                        onPress={() => router.push({ pathname: '/note/[id]', params: { id: String(n.id) } })}>
                        <ThemedText style={{ color: theme.accent }}>{n.title}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null;
              })()}

              <View style={styles.section}>
                <ThemedText type="smallBold">Flashcards</ThemedText>
                {cards.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Turn this note into flashcards so the daily session brings it back.
                  </ThemedText>
                ) : (
                  cards.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => router.push({ pathname: '/card/edit', params: { id: String(c.id) } })}
                      style={[styles.linkCard, { borderColor: theme.border }]}>
                      <ThemedText type="smallBold">{c.front}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {c.back}
                      </ThemedText>
                      {c.status === 'suggested' ? (
                        <ThemedText type="small" style={{ color: theme.accent }}>
                          Suggested, tap to keep or edit
                        </ThemedText>
                      ) : null}
                    </Pressable>
                  ))
                )}
                <Row>
                  <Button label={busy ? 'Gemini is writing …' : 'Suggest cards'} disabled={busy} onPress={suggestCards} />
                  <Button
                    label="+ Card"
                    variant="ghost"
                    onPress={() => router.push({ pathname: '/card/edit', params: { noteId: String(note.id) } })}
                  />
                </Row>
                {status ? <ThemedText type="small">{status}</ThemedText> : null}
              </View>
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
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.three },
  quoteText: { fontStyle: 'italic' },
  body: { fontSize: 17, lineHeight: 26 },
  linkCard: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: 2 },
  section: { gap: Spacing.two, marginTop: Spacing.two },
});
