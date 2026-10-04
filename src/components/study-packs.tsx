import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { importPack, listPacks, loadPack, type Pack, type PackInfo, type PackResult } from '@/data/packs';
import { useDb } from '@/db/db';
import { useTheme } from '@/hooks/use-theme';

function PackCard({ info, added }: { info: PackInfo; added: boolean }) {
  const db = useDb();
  const theme = useTheme();
  const [pack, setPack] = useState<Pack | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PackResult | null>(null);
  const [error, setError] = useState('');

  // The people list is shown once the pack is added; load the pack for it.
  useEffect(() => {
    if (!added) return;
    let alive = true;
    loadPack(info.id)
      .then((p) => alive && setPack(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [added, info.id]);

  async function add() {
    setBusy(true);
    setError('');
    try {
      const p = await loadPack(info.id);
      setPack(p);
      setResult(await importPack(db, p));
    } catch {
      setError('The pack could not be loaded. Are you online?');
    } finally {
      setBusy(false);
    }
  }

  const toFollow = pack?.people.filter((p) => !p.openalexIds?.length) ?? [];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{info.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {info.description}
      </ThemedText>
      {added || result ? (
        <ThemedText type="small" style={{ color: theme.success }}>
          {result
            ? `Added: ${[
                result.lessons ? `a course of ${result.lessons} lessons (daily lessons now come from it)` : '',
                result.papers ? `${result.papers} papers at the front of your backlog` : '',
                `${result.people} people followed (see Feed → People)`,
              ]
                .filter(Boolean)
                .join(', ')}.`
            : 'Added ✓'}
        </ThemedText>
      ) : (
        <Button label={busy ? 'Adding …' : 'Add to my app'} variant="primary" disabled={busy} onPress={add} />
      )}
      {error ? <ThemedText type="small">{error}</ThemedText> : null}
      {(added || result) && toFollow.length > 0 && (
        <View style={styles.people}>
          <ThemedText type="smallBold">People worth following</ThemedText>
          {toFollow.map((p) => (
            <View key={p.name} style={styles.person}>
              <View style={styles.flex}>
                <ThemedText>{p.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {p.why}
                </ThemedText>
              </View>
              <Button
                label="Follow"
                onPress={() => router.push({ pathname: '/person/follow', params: { name: p.name } })}
              />
            </View>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

// Ready-made topics with a course, papers and people, e.g. for an upcoming thesis.
export function StudyPacks({ added }: { added: string[] }) {
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  useEffect(() => {
    let alive = true;
    listPacks()
      .then((p) => alive && setPacks(p))
      .catch(() => alive && setPacks([]));
    return () => {
      alive = false;
    };
  }, []);
  if (!packs || packs.length === 0) return null;
  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Study packs</ThemedText>
      {packs.map((p) => (
        <PackCard key={p.id} info={p} added={added.includes(p.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  people: { gap: Spacing.two, marginTop: Spacing.two },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, gap: 2 },
});
