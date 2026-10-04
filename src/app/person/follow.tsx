import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { blueskyCandidates, followProfiles, likelySame, setBluesky } from '@/data/people';
import { useDb } from '@/db/db';
import { getPerson } from '@/db/repos/people';
import type { AuthorProfile } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import type { BlueskyActor } from '@/sources/bluesky';
import { searchAuthors } from '@/sources/openalex';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/people');
}

// Follow someone: search the name, tick every profile that is this person (OpenAlex
// often splits one researcher by institution), then confirm their Bluesky account.
// From a suggestion, `name` and `ids` arrive in the route and the search runs at once.
export default function FollowScreen() {
  const params = useLocalSearchParams<{ name?: string; ids?: string }>();
  const db = useDb();
  const theme = useTheme();
  const [query, setQuery] = useState(params.name ?? '');
  const [results, setResults] = useState<AuthorProfile[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState(params.name ? 'Searching …' : '');
  const [personId, setPersonId] = useState<number | null>(null);
  const [personName, setPersonName] = useState('');
  const [accounts, setAccounts] = useState<BlueskyActor[] | null>(null);
  const [handle, setHandle] = useState('');

  function applyResults(found: AuthorProfile[], preselect: string[]) {
    setResults(found);
    const main = found.find((f) => preselect.includes(f.id)) ?? found[0];
    setSelected(main ? [...new Set([...preselect, main.id, ...likelySame(main, found)])] : []);
    setStatus(found.length ? '' : 'Nobody found. Check the spelling.');
  }

  function search(name: string) {
    if (!name.trim()) return;
    setStatus('Searching …');
    setResults(null);
    searchAuthors(name.trim())
      .then((found) => applyResults(found, []))
      .catch(() => setStatus('Could not reach OpenAlex. Are you online?'));
  }

  // Coming from a suggestion: search right away with its entries ticked.
  useEffect(() => {
    if (!params.name) return;
    let alive = true;
    const preselect = params.ids ? params.ids.split(',') : [];
    searchAuthors(params.name.trim())
      .then((found) => alive && applyResults(found, preselect))
      .catch(() => alive && setStatus('Could not reach OpenAlex. Are you online?'));
    return () => {
      alive = false;
    };
    // Runs once for the route parameters it was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  async function follow() {
    const chosen = (results ?? []).filter((r) => selected.includes(r.id));
    if (chosen.length === 0) return;
    setStatus('Following …');
    const id = await followProfiles(db, chosen);
    const name = [...chosen].sort((a, b) => b.works - a.works)[0].name;
    setPersonId(id);
    setPersonName(name);
    setStatus('');
    setAccounts(await blueskyCandidates(name).catch(() => []));
  }

  async function finish(chosen: string | null) {
    if (personId === null) return;
    const person = await getPerson(db, personId);
    if (person && chosen) await setBluesky(db, person, chosen);
    router.replace({ pathname: '/person/[id]', params: { id: String(personId) } });
  }

  const count = selected.length;

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
                onSubmitEditing={() => search(query)}
                returnKeyType="search"
                autoCorrect={false}
                autoFocus={!params.name}
                placeholder="e.g. Fabian Isensee"
              />
              <Button label="Search" onPress={() => search(query)} />
              {status ? <ThemedText type="small">{status}</ThemedText> : null}

              {results && results.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  OpenAlex sometimes lists one person several times, for example once per
                  institution. Tick every entry that is the same person; the app then shows the
                  papers of all of them, and it keeps looking for new entries later.
                </ThemedText>
              )}
              {results?.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    style={({ pressed }) => [
                      styles.card,
                      {
                        borderColor: on ? theme.accent : theme.border,
                        borderWidth: on ? 2 : 1,
                        opacity: pressed ? 0.6 : 1,
                      },
                    ]}>
                    <View
                      style={[
                        styles.check,
                        { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accent : 'transparent' },
                      ]}>
                      {on ? <ThemedText style={{ color: theme.onAccent }}>✓</ThemedText> : null}
                    </View>
                    <View style={styles.flex}>
                      <ThemedText style={styles.bold}>{c.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {c.institutions.slice(0, 2).join(', ') || 'No institution known'}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[`${c.works} papers`, `${c.citations} citations`, c.topic, c.orcid ? 'ORCID' : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
              {results && results.length > 0 && (
                <Button
                  label={count <= 1 ? 'Follow' : `Follow (${count} entries, one person)`}
                  variant="primary"
                  disabled={count === 0}
                  onPress={follow}
                />
              )}
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
                  key={a.did}
                  onPress={() => finish(a.handle)}
                  style={({ pressed }) => [
                    styles.card,
                    { borderColor: theme.border, borderWidth: 1, opacity: pressed ? 0.6 : 1 },
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
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: 700 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
});
