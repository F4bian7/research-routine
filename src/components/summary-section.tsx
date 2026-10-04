import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { getSettings } from '@/db/repos/settings';
import { getSummary, saveSummary } from '@/db/repos/summaries';
import type { Paper } from '@/db/types';
import { claudeUrl } from '@/sources/claude';
import { getGemini } from '@/data/learn';
import { explainError, summarize } from '@/sources/gemini';

const PARTS: { key: 'problem' | 'method' | 'result' | 'relevance' | 'limits'; label: string }[] = [
  { key: 'problem', label: 'Problem' },
  { key: 'method', label: 'Approach' },
  { key: 'result', label: 'Result' },
  { key: 'relevance', label: 'Why it matters' },
  { key: 'limits', label: 'Limits' },
];

// "Explained simply": a stored Gemini summary, or a button to create one.
// `text` is what Gemini reads: the full text when available, otherwise the abstract.
// "Ask Claude" opens a claude.ai chat with the paper handed over, for follow-up questions.
export function SummarySection({
  paper,
  text,
  abstract,
}: {
  paper: Paper;
  text: string;
  abstract: string;
}) {
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
    const g = await getGemini(db);
    if (!g) return;
    setBusy(true);
    setError('');
    try {
      let model = g.model;
      const s = await summarize({ ...g, onModel: (m) => ((model = m), g.onModel?.(m)) }, { title: paper.title, text });
      await saveSummary(db, paper.id, s, model);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="smallBold" style={styles.heading}>
        Explained simply
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
              <ThemedText type="smallBold">Terms</ThemedText>
              {summary.terms.map((t) => (
                <ThemedText key={t.term}>
                  <ThemedText style={styles.term}>{t.term}: </ThemedText>
                  {t.explanation}
                </ThemedText>
              ))}
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Written by Gemini, may contain mistakes.
          </ThemedText>
        </>
      ) : !settings.geminiApiKey ? (
        <>
          <ThemedText themeColor="textSecondary">
            For summaries, add a free Gemini API key in the settings once.
          </ThemedText>
          <Button label="Go to settings" onPress={() => router.navigate('/settings')} />
        </>
      ) : null}

      {settings.geminiApiKey && (
        <Button
          label={busy ? 'Gemini is reading …' : summary ? 'Regenerate' : 'Explain it'}
          variant={summary ? 'ghost' : 'primary'}
          disabled={busy || !text}
          onPress={run}
        />
      )}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Button label="Ask Claude ↗" onPress={() => openUrl(claudeUrl(paper, abstract))} />
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
