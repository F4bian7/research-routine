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

  if (!settings) return <ThemedView style={styles.container} />;
  const keyValue = key ?? settings.geminiApiKey ?? '';
  const modelValue = model ?? settings.geminiModel;

  async function save() {
    await setSetting(db, 'geminiApiKey', keyValue.trim() || null);
    await setSetting(db, 'geminiModel', modelValue.trim() || DEFAULT_SETTINGS.geminiModel);
  }

  async function test() {
    await save();
    if (!keyValue.trim()) return setStatus('Erst einen Key eintragen.');
    setStatus('Prüfe …');
    try {
      await checkKey(keyValue.trim(), modelValue.trim() || DEFAULT_SETTINGS.geminiModel);
      setStatus('Funktioniert.');
    } catch (e) {
      setStatus(explainError(e));
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.headline}>Einstellungen</ThemedText>

          <ThemedView type="backgroundElement" style={styles.section}>
            <ThemedText type="smallBold">Zusammenfassungen mit Gemini</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Kostenloser Key aus Google AI Studio: dort anmelden, „Create API key“, Key kopieren
              und hier einfügen. Der Key bleibt auf diesem Gerät. In der Gratis-Stufe darf Google
              die gesendeten Paper-Texte zur Verbesserung nutzen; deine Notizen werden nie
              gesendet.
            </ThemedText>
            <Button
              label="Google AI Studio öffnen ↗"
              onPress={() => openUrl('https://aistudio.google.com/apikey')}
            />
            <Field
              label="API-Key"
              value={keyValue}
              onChangeText={setKey}
              onBlur={save}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="AIza…"
            />
            <Field
              label="Modell"
              value={modelValue}
              onChangeText={setModel}
              onBlur={save}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Row>
              <Button label="Key testen" variant="primary" onPress={test} />
            </Row>
            {status ? <ThemedText type="small">{status}</ThemedText> : null}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            Routine, Erinnerung, Schnellzugriffe und Backup kommen in einem späteren Schritt.
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
