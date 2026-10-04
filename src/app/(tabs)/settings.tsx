import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { useDb } from '@/db/db';
import { DEFAULT_SETTINGS } from '@/db/defaults';
import { getSettings, setSetting } from '@/db/repos/settings';
import { checkKey, explainError } from '@/sources/gemini';

// Only the Gemini section so far; routine, reminder, quick links and backup follow.
export default function SettingsScreen() {
  const db = useDb();
  const settings = useQuery(getSettings);
  const [key, setKey] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [bsky, setBsky] = useState<string | null>(null);

  if (!settings) return <ThemedView style={styles.container} />;
  const keyValue = key ?? settings.geminiApiKey ?? '';
  const modelValue = model ?? settings.geminiModel;

  async function save() {
    await setSetting(db, 'geminiApiKey', keyValue.trim() || null);
    await setSetting(db, 'geminiModel', modelValue.trim() || DEFAULT_SETTINGS.geminiModel);
  }

  async function test() {
    await save();
    if (!keyValue.trim()) return setStatus('Enter a key first.');
    setStatus('Checking …');
    try {
      await checkKey(keyValue.trim(), modelValue.trim() || DEFAULT_SETTINGS.geminiModel);
      setStatus('Works.');
    } catch (e) {
      setStatus(explainError(e));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.headline}>Settings</ThemedText>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="smallBold">Summaries with Gemini</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Free key from Google AI Studio: sign in, {'"Create API key"'}, copy the key and paste it
              here. The key stays on this device. On the free tier Google may use the paper text
              it receives to improve its products; your notes are never sent.
            </ThemedText>
            <Button
              label="Open Google AI Studio ↗"
              onPress={() => openUrl('https://aistudio.google.com/apikey')}
            />
            <Field
              label="API key"
              value={keyValue}
              onChangeText={setKey}
              onBlur={save}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="AIza…"
            />
            <Field
              label="Model"
              value={modelValue}
              onChangeText={setModel}
              onBlur={save}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Row>
              <Button label="Test key" variant="primary" onPress={test} />
            </Row>
            {status ? <ThemedText type="small">{status}</ThemedText> : null}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="smallBold">Bluesky feed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Accounts (for example name.bsky.social, separated by commas) or the link to one
              Bluesky list. Leave empty to see posts that link to arXiv and match your topic
              keywords.
            </ThemedText>
            <Field
              label="Accounts or list link"
              value={bsky ?? settings.blueskySource}
              onChangeText={setBsky}
              onBlur={() => {
                if (bsky !== null) setSetting(db, 'blueskySource', bsky.trim());
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://bsky.app/profile/…/lists/…"
            />
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Routine, reminder, quick links and backup come in a later step.
          </ThemedText>
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
  headline: { fontSize: 34, lineHeight: 40, fontWeight: 700, marginTop: Spacing.two },
  section: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
});
