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
import { checkProfiles } from '@/data/people';
import { addPerson, deletePerson, getPerson, newPerson, updatePerson } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { Person, PersonLinks } from '@/db/types';
import { blueskyHandle, LINK_LABEL } from '@/domain/person-links';
import { useTheme } from '@/hooks/use-theme';
import { resolveDid } from '@/sources/bluesky';

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
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    const cleanLinks = Object.fromEntries(
      Object.entries(links).filter(([, v]) => typeof v === 'string' && v.trim())
    ) as PersonLinks;
    // A new or changed Bluesky handle is resolved to its permanent account id.
    const handle = blueskyHandle(cleanLinks.bluesky);
    const handleChanged = handle !== blueskyHandle(person?.links.bluesky);
    const blueskyDid = !handle ? null : handleChanged ? await resolveDid(handle) : (person?.blueskyDid ?? null);
    const fields = { name: name.trim(), institution: institution.trim(), topicIds, links: cleanLinks, blueskyDid };
    if (person) {
      await updatePerson(db, { ...person, ...fields });
      goBack();
    } else {
      const id = await addPerson(db, newPerson(fields));
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
            {person && person.openalexIds.length > 0
              ? `Linked to ${person.openalexIds.length} OpenAlex ${person.openalexIds.length === 1 ? 'entry' : 'entries'}${person.orcid ? ' and an ORCID' : ''}.`
              : 'Not linked to any papers. To see someone\'s papers, use "+ Follow" in People instead.'}
          </ThemedText>
          {person && person.openalexIds.length > 0 ? (
            <Button
              label="Look for new entries now"
              onPress={async () => {
                setStatus('Searching OpenAlex …');
                try {
                  const p = await checkProfiles(db, { ...person, name: name.trim() || person.name });
                  setStatus(
                    p.pendingProfiles.length
                      ? `${p.pendingProfiles.length} possible entries, confirm them on the person page.`
                      : 'Nothing new found.'
                  );
                } catch {
                  setStatus('Could not reach OpenAlex. Are you online?');
                }
              }}
            />
          ) : null}
          {status ? <ThemedText type="small">{status}</ThemedText> : null}
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
});
