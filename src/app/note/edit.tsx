import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { linksForPaper } from '@/data/notes';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { addNote, deleteNote, getNote, updateNote } from '@/db/repos/notes';
import { getPaper } from '@/db/repos/papers';
import { listPeople } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { Note, Paper, Person, Topic } from '@/db/types';
import { titleFrom } from '@/domain/wikilinks';

const BRAIN = { pathname: '/brain', params: { view: 'notes' } } as const;

type Ctx = { note: Note | null; paper: Paper | null; topics: Topic[]; people: Person[] };

function Form({ ctx, initial }: { ctx: Ctx; initial: { title: string; quote: string; paperId: number | null } }) {
  const db = useDb();
  const { note, topics, people } = ctx;
  const [title, setTitle] = useState(note?.title ?? initial.title);
  const [quote, setQuote] = useState(note?.quote ?? initial.quote);
  const [body, setBody] = useState(note?.body ?? '');
  const [paperId, setPaperId] = useState<number | null>(note?.paperId ?? initial.paperId);
  const [topicIds, setTopicIds] = useState<number[]>(note?.topicIds ?? []);
  const [personIds, setPersonIds] = useState<number[]>(note?.personIds ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const paper = paperId ? ctx.paper : null;

  // A new note about a paper starts linked to its topic and to the people who wrote it.
  useEffect(() => {
    if (note || !initial.paperId) return;
    let alive = true;
    linksForPaper(db, initial.paperId).then((l) => {
      if (!alive) return;
      setTopicIds((t) => (t.length ? t : l.topicIds));
      setPersonIds((p) => (p.length ? p : l.personIds));
    });
    return () => {
      alive = false;
    };
  }, [db, note, initial.paperId]);

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const canSave = !!(title.trim() || body.trim() || quote.trim());

  async function save() {
    const fields = {
      title: title.trim() || titleFrom(body || quote),
      body: body.trim(),
      quote: quote.trim(),
      paperId,
      topicIds,
      personIds,
    };
    if (note) {
      await updateNote(db, { ...note, ...fields });
      goBack(BRAIN);
    } else {
      const id = await addNote(db, fields);
      router.replace({ pathname: '/note/[id]', params: { id: String(id) } });
    }
  }

  return (
    <>
      <ScreenBar
        left={{ label: 'Cancel', onPress: () => goBack(BRAIN) }}
        title={note ? 'Edit note' : 'New note'}
        right={{ label: 'Save', onPress: save, bold: true, disabled: !canSave }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Taken from the first line if empty" />
        {quote || initial.quote ? (
          <Field label="Quote from the paper" value={quote} onChangeText={setQuote} multiline />
        ) : null}
        <Field
          label="Your thought"
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus={!note}
          placeholder="One idea, in your own words. Link other notes with [[Their title]]."
          style={styles.body}
        />
        {paper ? (
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">
              About the paper
            </ThemedText>
            <ThemedText type="smallBold">{paper.title}</ThemedText>
            <Button label="Unlink paper" variant="ghost" onPress={() => setPaperId(null)} />
          </View>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          Topics
        </ThemedText>
        <Row>
          {topics.map((t) => (
            <Chip
              key={t.id}
              label={t.name}
              color={t.color}
              selected={topicIds.includes(t.id)}
              onPress={() => setTopicIds(toggle(topicIds, t.id))}
            />
          ))}
        </Row>
        {people.length > 0 && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              People
            </ThemedText>
            <Row>
              {people.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={personIds.includes(p.id)}
                  onPress={() => setPersonIds(toggle(personIds, p.id))}
                />
              ))}
            </Row>
          </>
        )}
        {note ? (
          <Button
            label={confirmDelete ? 'Really delete?' : 'Delete note'}
            variant={confirmDelete ? 'danger' : 'ghost'}
            onPress={async () => {
              if (!confirmDelete) return setConfirmDelete(true);
              await deleteNote(db, note.id);
              router.replace(BRAIN);
            }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

export default function EditNoteScreen() {
  const params = useLocalSearchParams<{ id?: string; paperId?: string; quote?: string; title?: string }>();
  const paperId = params.paperId ? Number(params.paperId) : null;
  const load = useCallback(
    async (d: Db): Promise<Ctx> => {
      const note = params.id ? await getNote(d, Number(params.id)) : null;
      const pid = note?.paperId ?? paperId;
      const [paper, topics, people] = await Promise.all([
        pid ? getPaper(d, pid) : null,
        listTopics(d),
        listPeople(d),
      ]);
      return { note, paper, topics, people };
    },
    [params.id, paperId]
  );
  const ctx = useQuery(load);
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        {ctx ? (
          <Form
            ctx={ctx}
            initial={{ title: params.title ?? '', quote: params.quote ?? '', paperId }}
          />
        ) : null}
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
  body: { minHeight: 160 },
  block: { gap: Spacing.one },
});
