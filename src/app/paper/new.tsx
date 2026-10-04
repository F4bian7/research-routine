import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Field, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import { useDb } from '@/db/db';
import { addPaper } from '@/db/repos/papers';
import { listTopics } from '@/db/repos/topics';
import type { PaperType } from '@/db/types';
import { PAPER_TYPE_LABEL } from '@/domain/labels';
import { useTheme } from '@/hooks/use-theme';
import { canonicalUrl, parsePaperLink } from '@/sources/links';
import { fetchMeta } from '@/sources/meta';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/backlog');
}

async function readClipboard(): Promise<string> {
  if (Platform.OS === 'web' && navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  return '';
}

export default function NewPaperScreen() {
  const db = useDb();
  const theme = useTheme();
  const topics = useQuery(listTopics) ?? [];
  const [link, setLink] = useState('');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [topicId, setTopicId] = useState<number | null>(null);
  const [type, setType] = useState<PaperType>('other');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');

  // Fills empty fields from OpenAlex when the link is an arXiv id or a DOI.
  async function lookup(value: string) {
    const ref = parsePaperLink(value);
    if (ref.kind === 'url') {
      setStatus('');
      return;
    }
    setStatus('Looking up title and authors …');
    const meta = await fetchMeta(ref).catch(() => null);
    if (!meta) {
      setStatus('Nothing found, please fill in by hand.');
      return;
    }
    setTitle((t) => t || meta.title);
    setAuthors((a) => a || meta.authors);
    setYear((y) => y || (meta.year ? String(meta.year) : ''));
    setStatus('');
  }

  async function paste() {
    const text = (await readClipboard().catch(() => '')).trim();
    if (!text) {
      setStatus('Clipboard is empty or not readable.');
      return;
    }
    setLink(text);
    lookup(text);
  }

  async function save() {
    const ref = parsePaperLink(link);
    await addPaper(db, {
      title: title.trim() || link.trim(),
      url: link.trim() ? canonicalUrl(ref) : '',
      authors: authors.trim(),
      year: year ? Number(year) || null : null,
      topicId,
      type,
      note: note.trim(),
    });
    goBack();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.barButton}>
            <ThemedText style={{ color: theme.accent }}>Cancel</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">Add paper</ThemedText>
          <Pressable
            onPress={save}
            disabled={!title.trim() && !link.trim()}
            hitSlop={12}
            style={styles.barButton}>
            <ThemedText style={{ color: theme.accent, fontWeight: 700 }}>Save</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button label="Paste link from clipboard" variant="primary" onPress={paste} />
          <Field
            label="Link (arXiv, DOI or URL)"
            value={link}
            onChangeText={setLink}
            onBlur={() => lookup(link)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://arxiv.org/abs/…"
          />
          {status ? (
            <ThemedText type="small" themeColor="textSecondary">
              {status}
            </ThemedText>
          ) : null}
          <Field label="Title" value={title} onChangeText={setTitle} multiline />
          <Field label="Authors" value={authors} onChangeText={setAuthors} />
          <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" />

          <ThemedText type="small" themeColor="textSecondary">
            Topic
          </ThemedText>
          <Row>
            {topics.map((t) => (
              <Chip
                key={t.id}
                label={t.name}
                color={t.color}
                selected={topicId === t.id}
                onPress={() => setTopicId(topicId === t.id ? null : t.id)}
              />
            ))}
          </Row>

          <ThemedText type="small" themeColor="textSecondary">
            Type
          </ThemedText>
          <Row>
            {(Object.keys(PAPER_TYPE_LABEL) as PaperType[]).map((k) => (
              <Chip key={k} label={PAPER_TYPE_LABEL[k]} selected={type === k} onPress={() => setType(k)} />
            ))}
          </Row>

          <Field label="Note" value={note} onChangeText={setNote} multiline />
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
  barButton: { minHeight: 44, justifyContent: 'center' },
  content: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
