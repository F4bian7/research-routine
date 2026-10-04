import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { blueskyCandidates, candidateInstitution, followAuthor } from '@/data/people';
import { useDb } from '@/db/db';
import { getPerson, updatePerson } from '@/db/repos/people';
import { useTheme } from '@/hooks/use-theme';
import type { BlueskyActor } from '@/sources/bluesky';
import { type AuthorCandidate, searchAuthors } from '@/sources/openalex';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/people');
}

// Follow someone in two taps: pick the researcher, then confirm their Bluesky account.
// Also reached from a suggestion, with the OpenAlex id and name already known.
export default function FollowScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; institution?: string }>();
  const db = useDb();
  const theme = useTheme();
  const [query, setQuery] = useState(params.name ?? '');
  const [results, setResults] = useState<AuthorCandidate[] | null>(null);
  const [status, setStatus] = useState('');
  const [personId, setPersonId] = useState<number | null>(null);
  const [personName, setPersonName] = useState('');
  const [accounts, setAccounts] = useState<BlueskyActor[] | null>(null);
  const [handle, setHandle] = useState('');

  async function search() {
    if (!query.trim()) return;
    setStatus('Searching …');
    setResults(null);
    try {
      const found = await searchAuthors(query.trim());
      setResults(found);
      setStatus(found.length ? '' : 'Nobody found. Check the spelling.');
    } catch {
      setStatus('Could not reach OpenAlex. Are you online?');
    }
  }

  async function follow(a: { id: string; name: string; institution: string }) {
    setStatus(`Following ${a.name} …`);
    const id = await followAuthor(db, a);
    setPersonId(id);
    setPersonName(a.name);
    setStatus('');
    setAccounts(await blueskyCandidates(a.name).catch(() => []));
  }

  async function finish(chosen: string | null) {
    if (personId !== null && chosen) {
      const p = await getPerson(db, personId);
      if (p) await updatePerson(db, { ...p, links: { ...p.links, bluesky: chosen } });
    }
    if (personId !== null) {
      router.replace({ pathname: '/person/[id]', params: { id: String(personId) } });
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.barButton}>
            <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Follow someone</ThemedText>
          <View style={styles.barButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {personId === null ? (
            <>
              <Field
                label="Name of the researcher"
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={search}
                returnKeyType="search"
                autoCorrect={false}
                autoFocus={!params.id}
                placeholder="e.g. Fabian Isensee"
              />
              {params.id ? (
                <Button
                  label={`Follow ${params.name}`}
                  variant="primary"
                  onPress={() =>
                    follow({ id: params.id!, name: params.name ?? '', institution: params.institution ?? '' })
                  }
                />
              ) : (
                <Button label="Search" variant="primary" onPress={search} />
              )}
              {status ? <ThemedText type="small">{status}</ThemedText> : null}
              {results?.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => follow({ id: c.id, name: c.name, institution: candidateInstitution(c) })}
                  style={({ pressed }) => [
                    styles.card,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <View style={styles.flex}>
                    <ThemedText style={styles.bold}>{c.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {c.institutions.slice(0, 2).join(', ') || 'No institution known'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[`${c.works} papers`, `${c.citations} citations`, c.topic].filter(Boolean).join(' · ')}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.bold, { color: theme.accent }]}>Follow</ThemedText>
                </Pressable>
              ))}
              {results && results.length > 1 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Several profiles for one name are common; the one with the most papers is usually
                  the right one.
                </ThemedText>
              ) : null}
            </>
          ) : accounts === null ? (
            <ThemedText themeColor="textSecondary">Looking for {personName} on Bluesky …</ThemedText>
          ) : (
            <>
              <ThemedText style={styles.bold}>Is {personName} on Bluesky?</ThemedText>
              {accounts.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No account with this name found. If you know the handle, enter it below.
                </ThemedText>
              ) : null}
              {accounts.map((a) => (
                <Pressable
                  key={a.handle}
                  onPress={() => finish(a.handle)}
                  style={({ pressed }) => [
                    styles.card,
                    { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  {a.avatar ? <Image source={{ uri: a.avatar }} style={styles.avatar} /> : null}
                  <View style={styles.flex}>
                    <ThemedText style={styles.bold}>{a.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      @{a.handle}
                    </ThemedText>
                    {a.description ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {a.description}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText style={[styles.bold, { color: theme.accent }]}>That&apos;s them</ThemedText>
                </Pressable>
              ))}
              <Field
                label="Bluesky handle"
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="name.bsky.social"
              />
              {handle.trim() ? (
                <Button label="Use this handle" variant="primary" onPress={() => finish(handle.trim())} />
              ) : null}
              <Button label="Not on Bluesky, done" variant="ghost" onPress={() => finish(null)} />
            </>
          )}
        </ScrollView>
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
  barButton: { minHeight: 44, minWidth: 60, justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: 700 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
});
