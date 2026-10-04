import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goBack, ScreenBar } from '@/components/screen-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { addCards, deleteCard, getCard, updateCard } from '@/db/repos/cards';
import { getNote } from '@/db/repos/notes';
import type { Card } from '@/db/types';

const CARDS = { pathname: '/brain', params: { view: 'cards' } } as const;

function Form({ card, noteId, topicId }: { card: Card | null; noteId: number | null; topicId: number | null }) {
  const db = useDb();
  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ok = !!(front.trim() && back.trim());

  async function save() {
    if (card) {
      // Saving a suggested card means keeping it.
      await updateCard(db, card.id, { front: front.trim(), back: back.trim(), status: 'active' });
    } else {
      await addCards(db, [
        { front: front.trim(), back: back.trim(), source: noteId ? 'note' : 'manual', status: 'active', noteId, topicId },
      ]);
    }
    goBack(CARDS);
  }

  return (
    <>
      <ScreenBar
        left={{ label: 'Cancel', onPress: () => goBack(CARDS) }}
        title={card ? (card.status === 'suggested' ? 'Suggested card' : 'Edit card') : 'New card'}
        right={{ label: card?.status === 'suggested' ? 'Keep' : 'Save', onPress: save, bold: true, disabled: !ok }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          One question, one short answer. Cards come back in the daily session, more rarely the
          better you know them.
        </ThemedText>
        <Field label="Question" value={front} onChangeText={setFront} multiline autoFocus={!card} />
        <Field label="Answer" value={back} onChangeText={setBack} multiline />
        {card ? (
          <Button
            label={confirmDelete ? 'Really delete?' : 'Delete card'}
            variant={confirmDelete ? 'danger' : 'ghost'}
            onPress={async () => {
              if (!confirmDelete) return setConfirmDelete(true);
              await deleteCard(db, card.id);
              router.replace(CARDS);
            }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

export default function EditCardScreen() {
  const params = useLocalSearchParams<{ id?: string; noteId?: string }>();
  const load = useCallback(
    async (d: Db) => {
      const card = params.id ? await getCard(d, Number(params.id)) : null;
      const note = params.noteId ? await getNote(d, Number(params.noteId)) : null;
      return { card, noteId: note?.id ?? null, topicId: note?.topicIds[0] ?? null };
    },
    [params.id, params.noteId]
  );
  const data = useQuery(load);
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        {data ? <Form card={data.card} noteId={data.noteId} topicId={data.topicId} /> : null}
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
});
