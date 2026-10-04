import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlueskyPostCard, bskyKey, FeedMessage, FeedPaperCard } from '@/components/feed-cards';
import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useQuery } from '@/data/use-query';
import type { Db } from '@/db/db';
import { getFeedDecisions } from '@/db/repos/feed';
import { getPerson } from '@/db/repos/people';
import { listTopics } from '@/db/repos/topics';
import type { PersonLinks } from '@/db/types';
import { blueskyHandle, LINK_LABEL, linkFor, scholarSearchUrl } from '@/domain/person-links';
import { useTheme } from '@/hooks/use-theme';
import { followedPosts } from '@/sources/bluesky';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import { authorWorks } from '@/sources/openalex';

type Loaded<T> = { key: string; items: T[] | null }; // items null = failed

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/people');
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const load = useCallback(
    async (d: Db) => {
      const [person, topics, decisions] = await Promise.all([
        getPerson(d, Number(id)),
        listTopics(d),
        getFeedDecisions(d),
      ]);
      return { person, topics, decisions };
    },
    [id]
  );
  const data = useQuery(load);
  const [tab, setTab] = useState<'papers' | 'bluesky'>('papers');
  const [papers, setPapers] = useState<Loaded<FeedPaper> | null>(null);
  const [posts, setPosts] = useState<Loaded<BlueskyPost> | null>(null);

  const authorId = data?.person?.openalexId ?? null;
  const handle = blueskyHandle(data?.person?.links.bluesky);

  useEffect(() => {
    if (!authorId) return;
    let alive = true;
    authorWorks(authorId)
      .then((items) => alive && setPapers({ key: authorId, items }))
      .catch(() => alive && setPapers({ key: authorId, items: null }));
    return () => {
      alive = false;
    };
  }, [authorId]);

  useEffect(() => {
    if (!handle || tab !== 'bluesky') return;
    let alive = true;
    followedPosts(handle)
      .then((items) => alive && setPosts({ key: handle, items }))
      .catch(() => alive && setPosts({ key: handle, items: null }));
    return () => {
      alive = false;
    };
  }, [handle, tab]);

  if (!data) return <ThemedView style={styles.container} />;
  const { person, topics, decisions } = data;

  const linkKinds = (Object.keys(LINK_LABEL) as (keyof PersonLinks)[]).filter((k) => person?.links[k]);
  const currentPapers = papers?.key === authorId ? papers.items : undefined;
  const currentPosts = posts?.key === handle ? posts.items : undefined;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.barButton}>
            <ThemedText style={{ color: theme.accent }}>‹ Back</ThemedText>
          </Pressable>
          {person ? (
            <Pressable
              onPress={() => router.push({ pathname: '/person/edit', params: { id: String(person.id) } })}
              hitSlop={12}
              style={styles.barButton}>
              <ThemedText style={{ color: theme.accent }}>Edit</ThemedText>
            </Pressable>
          ) : null}
        </View>

        {!person ? (
          <ThemedText style={styles.content}>This person no longer exists.</ThemedText>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText style={styles.title}>{person.name}</ThemedText>
            {person.institution ? (
              <ThemedText themeColor="textSecondary">{person.institution}</ThemedText>
            ) : null}
            <Row>
              {person.topicIds
                .map((t) => topics.find((x) => x.id === t))
                .filter((t) => !!t)
                .map((t) => (
                  <View key={t!.id} style={styles.topic}>
                    <View style={[styles.swatch, { backgroundColor: t!.color }]} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {t!.name}
                    </ThemedText>
                  </View>
                ))}
            </Row>

            <Row>
              {linkKinds.map((k) => (
                <Chip
                  key={k}
                  label={`${LINK_LABEL[k]} ↗`}
                  selected={false}
                  onPress={() => openUrl(linkFor(k, person.links[k]!))}
                />
              ))}
              {!person.links.scholar ? (
                <Chip label="Search Scholar ↗" selected={false} onPress={() => openUrl(scholarSearchUrl(person))} />
              ) : null}
            </Row>

            <Row>
              <Chip label="Papers" selected={tab === 'papers'} onPress={() => setTab('papers')} />
              <Chip label="Bluesky" selected={tab === 'bluesky'} onPress={() => setTab('bluesky')} />
            </Row>

            {tab === 'papers' ? (
              !authorId ? (
                <FeedMessage text='Not linked to OpenAlex yet. Tap "Edit", then "Find papers on OpenAlex".' />
              ) : currentPapers === undefined ? (
                <FeedMessage text="Loading …" />
              ) : currentPapers === null ? (
                <FeedMessage text="Could not load the papers. Are you online?" />
              ) : currentPapers.length === 0 ? (
                <FeedMessage text="No papers found." />
              ) : (
                currentPapers.map((p) => (
                  <FeedPaperCard key={p.id} paper={p} decision={decisions.get(p.id)} />
                ))
              )
            ) : !handle ? (
              <FeedMessage text='No Bluesky handle yet. Tap "Edit" to add one.' />
            ) : currentPosts === undefined ? (
              <FeedMessage text="Loading …" />
            ) : currentPosts === null ? (
              <FeedMessage text="Could not load Bluesky. Are you online?" />
            ) : currentPosts.length === 0 ? (
              <FeedMessage text="No posts yet." />
            ) : (
              currentPosts.map((p) => (
                <BlueskyPostCard key={p.uri} post={p} saved={decisions.get(bskyKey(p)) === 'saved'} />
              ))
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  title: { fontSize: 28, lineHeight: 34, fontWeight: 700 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 10, height: 10, borderRadius: 5 },
});
