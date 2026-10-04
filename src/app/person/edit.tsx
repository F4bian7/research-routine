import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { addPerson, deletePerson, getPerson, updatePerson } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { Person, PersonLinks } from '@/db/types';
import { LINK_LABEL } from '@/domain/person-links';
import { useTheme } from '@/hooks/use-theme';
import { type AuthorCandidate, searchAuthors } from '@/sources/openalex';

const LINK_HINT: Record<keyof PersonLinks, string> = {
  scholar: 'Profile link',
  semanticScholar: 'Profile link',
  bluesky: 'Handle, e.g. name.bsky.social',
  x: 'Handle, e.g. @name',
  website: 'Link',
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/people');
}

function Form({ person, topics }: { person: Person | null; topics: { id: number; name: string; color: string }[] }) {
  const db = useDb();
  const theme = useTheme();
  const [name, setName] = useState(person?.name ?? '');
  const [institution, setInstitution] = useState(person?.institution ?? '');
  const [topicIds, setTopicIds] = useState<number[]>(person?.topicIds ?? []);
  const [links, setLinks] = useState<PersonLinks>(person?.links ?? {});
  const [openalexId, setOpenalexId] = useState<string | null>(person?.openalexId ?? null);
  const [candidates, setCandidates] = useState<AuthorCandidate[] | null>(null);
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function find() {
    if (!name.trim()) return setStatus('Enter a name first.');
    setStatus('Searching OpenAlex …');
    try {
      const found = await searchAuthors(name.trim());
      setCandidates(found);
      setStatus(found.length ? 'Which one is it?' : 'Nobody found under this name.');
    } catch {
      setStatus('Could not reach OpenAlex. Are you online?');
    }
  }

  function pick(c: AuthorCandidate) {
    setOpenalexId(c.id);
    if (!institution.trim() && c.institutions[0]) setInstitution(c.institutions[0]);
    setCandidates(null);
    setStatus(`Linked to ${c.name} (${c.works} works).`);
  }

  async function save() {
    const input = {
      name: name.trim(),
      institution: institution.trim(),
      topicIds,
      links: Object.fromEntries(
        Object.entries(links).filter(([, v]) => typeof v === 'string' && v.trim())
      ) as PersonLinks,
      openalexId,
    };
    if (person) {
      await updatePerson(db, { ...person, ...input });
      goBack();
    } else {
      const id = await addPerson(db, input);
      router.replace({ pathname: '/person/[id]', params: { id: String(id) } });
    }
  }

  return (
    <>
      <View style={[styles.bar, { borderBottomColor: theme.border }]}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.barButton}>
          <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
        </Pressable>
        <ThemedText type="smallBold">{person ? 'Edit person' : 'Add person'}</ThemedText>
        <Pressable onPress={save} disabled={!name.trim()} hitSlop={12} style={styles.barButton}>
          <ThemedText style={{ color: theme.accent, fontWeight: 700, opacity: name.trim() ? 1 : 0.4 }}>
            Save
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={name} onChangeText={setName} autoCorrect={false} />
        <Field label="Institution or group" value={institution} onChangeText={setInstitution} />

        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {openalexId
              ? 'Papers come from OpenAlex. Search again to pick someone else.'
              : 'Link the person to OpenAlex to see their newest papers in the app.'}
          </ThemedText>
          <Row>
            <Button label={openalexId ? 'Search again' : 'Find papers on OpenAlex'} onPress={find} />
            {openalexId ? (
              <Button label="Unlink" variant="ghost" onPress={() => setOpenalexId(null)} />
            ) : null}
          </Row>
          {status ? <ThemedText type="small">{status}</ThemedText> : null}
          {candidates?.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => pick(c)}
              style={({ pressed }) => [styles.candidate, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="smallBold">{c.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[c.institutions.slice(0, 2).join(', '), `${c.works} works`, `${c.citations} citations`]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
              {c.topic ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {c.topic}
                </ThemedText>
              ) : null}
            </Pressable>
          ))}
        </View>

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
              onPress={() =>
                setTopicIds(topicIds.includes(t.id) ? topicIds.filter((x) => x !== t.id) : [...topicIds, t.id])
              }
            />
          ))}
        </Row>

        {(Object.keys(LINK_LABEL) as (keyof PersonLinks)[]).map((k) => (
          <Field
            key={k}
            label={LINK_LABEL[k]}
            placeholder={LINK_HINT[k]}
            value={links[k] ?? ''}
            onChangeText={(v) => setLinks({ ...links, [k]: v })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={k === 'bluesky' || k === 'x' ? 'default' : 'url'}
          />
        ))}

        {person ? (
          <Button
            label={confirmDelete ? 'Really delete?' : 'Delete person'}
            variant={confirmDelete ? 'danger' : 'ghost'}
            onPress={async () => {
              if (!confirmDelete) return setConfirmDelete(true);
              await deletePerson(db, person.id);
              router.replace('/people');
            }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

export default function EditPersonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const load = useCallback(
    async (d: Db) => ({
      person: id ? await getPerson(d, Number(id)) : null,
      topics: await listTopics(d),
    }),
    [id]
  );
  const data = useQuery(load);
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        {data ? <Form person={data.person} topics={data.topics} /> : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barButton: { minHeight: 44, justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  block: { gap: Spacing.two },
  candidate: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: 2 },
});
