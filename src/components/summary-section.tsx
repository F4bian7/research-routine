import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { getSettings } from '@/db/repos/settings';
import { getSummary, saveSummary } from '@/db/repos/summaries';
import type { Paper } from '@/db/types';
import { explainError, summarize } from '@/sources/gemini';

const PARTS: { key: 'problem' | 'method' | 'result' | 'relevance' | 'limits'; label: string }[] = [
  { key: 'problem', label: 'Problem' },
  { key: 'method', label: 'Vorgehen' },
  { key: 'result', label: 'Ergebnis' },
  { key: 'relevance', label: 'Warum wichtig' },
  { key: 'limits', label: 'Grenzen' },
];

// "Einfach erklärt": a stored Gemini summary, or a button to create one.
// `text` is what Gemini reads: the full text when available, otherwise the abstract.
export function SummarySection({ paper, text }: { paper: Paper; text: string }) {
  const db = useDb();
  const load = useCallback(
    async (d: Db) => ({ settings: await getSettings(d), summary: await getSummary(d, paper.id) }),
    [paper.id]
  );
  const data = useQuery(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!data) return null;
  const { settings, summary } = data;

  async function run() {
    if (!settings.geminiApiKey) return;
    setBusy(true);
    setError('');
    try {
      const s = await summarize(settings.geminiApiKey, settings.geminiModel, {
        title: paper.title,
        text,
      });
      await saveSummary(db, paper.id, s, settings.geminiModel);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="smallBold" style={styles.heading}>
        Einfach erklärt
      </ThemedText>

      {summary ? (
        <>
          <ThemedText>{summary.short}</ThemedText>
          {PARTS.filter((p) => summary[p.key]).map((p) => (
            <View key={p.key} style={styles.part}>
              <ThemedText type="smallBold">{p.label}</ThemedText>
              <ThemedText>{summary[p.key]}</ThemedText>
            </View>
          ))}
          {summary.terms.length > 0 && (
            <View style={styles.part}>
              <ThemedText type="smallBold">Begriffe</ThemedText>
              {summary.terms.map((t) => (
                <ThemedText key={t.term}>
                  <ThemedText style={styles.term}>{t.term}: </ThemedText>
                  {t.explanation}
                </ThemedText>
              ))}
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Von Gemini erzeugt, kann Fehler enthalten.
          </ThemedText>
        </>
      ) : !settings.geminiApiKey ? (
        <>
          <ThemedText themeColor="textSecondary">
            Für Zusammenfassungen einmal einen kostenlosen Gemini-API-Key in den Einstellungen
            eintragen.
          </ThemedText>
          <Button label="Zu den Einstellungen" onPress={() => router.navigate('/settings')} />
        </>
      ) : null}

      {settings.geminiApiKey && (
        <Button
          label={busy ? 'Gemini liest …' : summary ? 'Neu erzeugen' : 'Erklären lassen'}
          variant={summary ? 'ghost' : 'primary'}
          disabled={busy || !text}
          onPress={run}
        />
      )}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  heading: { fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  part: { gap: Spacing.half },
  term: { fontWeight: 700 },
  error: { color: '#D93F3F' },
});
