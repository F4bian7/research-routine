import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlueskyPostCard, bskyKey, FeedMessage, FeedPaperCard } from '@/components/feed-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { loadBluesky, loadNewPapers, loadTrending, NEW_PAPERS_DAYS } from '@/data/feeds';
import { useQuery } from '@/data/use-query';
import type { Db } from '@/db/db';
import { getFeedDecisions } from '@/db/repos/feed';
import { getSettings } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';

export type FeedTab = 'new' | 'trending' | 'bluesky';

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'done'; items: T[] };

async function loadContext(db: Db) {
  const [topics, settings, decisions] = await Promise.all([
    listTopics(db),
    getSettings(db),
    getFeedDecisions(db),
  ]);
  return { topics, settings, decisions };
}

type Result =
  | { key: string; ok: true; papers: FeedPaper[]; posts: BlueskyPost[] }
  | { key: string; ok: false };

function fetchFeed(
  tab: FeedTab,
  ctx: Awaited<ReturnType<typeof loadContext>>,
  refresh: boolean
): Promise<{ papers: FeedPaper[]; posts: BlueskyPost[] }> {
  if (tab === 'bluesky') {
    return loadBluesky(ctx.settings.blueskySource, ctx.topics, refresh).then((posts) => ({
      papers: [],
      posts,
    }));
  }
  const load = tab === 'new' ? loadNewPapers(ctx.topics, refresh) : loadTrending(refresh);
  return load.then((papers) => ({ papers, posts: [] }));
}

export default function FeedScreen() {
  const params = useLocalSearchParams<{ tab?: FeedTab }>();
  // The tab lives in the route, so the "Today" card can open a specific feed.
  const tab: FeedTab = params.tab ?? 'new';
  const setTab = (t: FeedTab) => router.setParams({ tab: t });
  const [topicId, setTopicId] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const ctx = useQuery(loadContext);

  const key = ctx
    ? `${tab}|${ctx.topics.map((t) => `${t.id}=${t.keywords}`).join(',')}|${ctx.settings.blueskySource}`
    : null;

  // Loads go through a session cache, so re-running after a like costs no request.
  useEffect(() => {
    if (!ctx || !key) return;
    let alive = true;
    fetchFeed(tab, ctx, false)
      .then((r) => alive && setResult({ key, ok: true, ...r }))
      .catch(() => alive && setResult({ key, ok: false }));
    return () => {
      alive = false;
    };
  }, [tab, ctx, key]);

  function refresh() {
    if (!ctx || !key) return;
    setRefreshing(true);
    fetchFeed(tab, ctx, true)
      .then((r) => setResult({ key, ok: true, ...r }))
      .catch(() => setResult({ key, ok: false }))
      .finally(() => setRefreshing(false));
  }

  const current = result && result.key === key && !refreshing ? result : null;
  const papers: Load<FeedPaper> = !current
    ? { state: 'loading' }
    : current.ok
      ? { state: 'done', items: current.papers }
      : { state: 'error' };
  const posts: Load<BlueskyPost> = !current
    ? { state: 'loading' }
    : current.ok
      ? { state: 'done', items: current.posts }
      : { state: 'error' };

  if (!ctx) return <ThemedView style={styles.container} />;
  const { topics, decisions } = ctx;
  const topicOf = (id: number | null) => topics.find((t) => t.id === id);

  const visiblePapers =
    papers.state === 'done'
      ? papers.items.filter(
          (p) => decisions.get(p.id) !== 'down' && (topicId === null || p.topicId === topicId)
        )
      : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText style={styles.headline}>Feed</ThemedText>
            <Button label="Refresh" onPress={refresh} />
          </View>

          <Row>
            <Chip label="New" selected={tab === 'new'} onPress={() => setTab('new')} />
            <Chip label="Trending" selected={tab === 'trending'} onPress={() => setTab('trending')} />
            <Chip label="Bluesky" selected={tab === 'bluesky'} onPress={() => setTab('bluesky')} />
          </Row>

          {tab === 'new' && (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                arXiv and PubMed, last {NEW_PAPERS_DAYS} days, matching your topic keywords.
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row style={styles.noWrap}>
                  <Chip label="All" selected={topicId === null} onPress={() => setTopicId(null)} />
                  {topics.map((t) => (
                    <Chip
                      key={t.id}
                      label={t.name}
                      color={t.color}
                      selected={topicId === t.id}
                      onPress={() => setTopicId(t.id)}
                    />
                  ))}
                </Row>
              </ScrollView>
            </>
          )}
          {tab === 'trending' && (
            <ThemedText type="small" themeColor="textSecondary">
              Hugging Face Daily Papers, most upvoted first. Mostly machine learning in general.
            </ThemedText>
          )}
          {tab === 'bluesky' && (
            <ThemedText type="small" themeColor="textSecondary">
              {ctx.settings.blueskySource.trim()
                ? 'Your Bluesky accounts or list (set in Settings).'
                : 'Bluesky posts linking to arXiv that match your topic keywords. Add your own accounts or a list in Settings.'}
            </ThemedText>
          )}

          {tab === 'bluesky' ? (
            posts.state === 'loading' ? (
              <FeedMessage text="Loading …" />
            ) : posts.state === 'error' ? (
              <FeedMessage text="Could not load Bluesky. Are you online?" onRetry={refresh} />
            ) : posts.items.length === 0 ? (
              <FeedMessage text="No posts found." />
            ) : (
              posts.items.map((p) => (
                <BlueskyPostCard key={p.uri} post={p} saved={decisions.get(bskyKey(p)) === 'saved'} />
              ))
            )
          ) : papers.state === 'loading' ? (
            <FeedMessage text="Loading …" />
          ) : papers.state === 'error' ? (
            <FeedMessage text="Could not load the feed. Are you online?" onRetry={refresh} />
          ) : visiblePapers.length === 0 ? (
            <FeedMessage
              text={
                tab === 'new'
                  ? 'Nothing new. Check the topic keywords in the Topics tab.'
                  : 'Nothing here right now.'
              }
            />
          ) : (
            visiblePapers.map((p) => (
              <FeedPaperCard
                key={p.id}
                paper={p}
                topic={topicOf(p.topicId)}
                decision={decisions.get(p.id)}
              />
            ))
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  headline: { fontSize: 34, lineHeight: 40, fontWeight: 700 },
  noWrap: { flexWrap: 'nowrap' },
});
