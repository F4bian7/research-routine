import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BackupSection,
  BlueskySection,
  GeminiSection,
  OpenAlexSection,
  QuickLinksSection,
  ReminderSection,
  RoutineSection,
} from '@/components/settings-sections';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import type { Db } from '@/db/db';
import { listRoutine } from '@/db/repos/routine';
import { getSettings } from '@/db/repos/settings';

async function load(db: Db) {
  const [settings, routine] = await Promise.all([getSettings(db), listRoutine(db)]);
  return { settings, routine };
}

export default function SettingsScreen() {
  const data = useQuery(load);
  // Bumped after a backup import so every form starts again from the restored values.
  const [generation, setGeneration] = useState(0);
  if (!data) return <ThemedView style={styles.container} />;
  const { settings, routine } = data;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.headline}>Settings</ThemedText>
          <View key={generation} style={styles.sections}>
            <RoutineSection routine={routine} settings={settings} />
            <ReminderSection settings={settings} />
            <QuickLinksSection settings={settings} />
            <GeminiSection settings={settings} />
            <BlueskySection settings={settings} />
            <OpenAlexSection settings={settings} />
          </View>
          <BackupSection onImported={() => setGeneration((g) => g + 1)} />
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
  sections: { gap: Spacing.three },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: 700, marginTop: Spacing.two },
});
