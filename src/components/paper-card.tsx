import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import type { Paper, Topic } from '@/db/types';
import { PAPER_TYPE_LABEL } from '@/domain/labels';
import { useTheme } from '@/hooks/use-theme';

export function paperMeta(paper: Paper) {
  return [paper.authors, paper.year, PAPER_TYPE_LABEL[paper.type]].filter(Boolean).join(' · ');
}

export function openReader(paper: Paper) {
  router.push({ pathname: '/paper/[id]', params: { id: String(paper.id) } });
}

export function PaperCard({
  paper,
  topic,
  children,
}: {
  paper: Paper;
  topic?: Topic;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      {topic && (
        <View style={styles.topicRow}>
          <View style={[styles.swatch, { backgroundColor: topic.color }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {topic.name}
          </ThemedText>
        </View>
      )}
      <ThemedText type="smallBold" style={styles.title}>
        {paper.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {paperMeta(paper)}
      </ThemedText>
      <Button label="Open" variant="primary" onPress={() => openReader(paper)} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  topicRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 16, lineHeight: 22 },
});
