import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BlueskyPostCard,
  bskyKey,
  FeedMessage,
  FeedPaperCard,
  TimelineCard,
  WebCard,
} from '@/components/feed-cards';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { type Highlights, loadBluesky, loadHighlights, loadNewPapers, NEW_PAPERS_DAYS } from '@/data/feeds';
import { openAlexHint } from '@/sources/openalex-client';
import { checkDuePeople, loadTimeline, peopleKey, type Timeline } from '@/data/people';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { type FeedDecision, getFeedDecisions } from '@/db/repos/feed';
import { listPeople } from '@/db/repos/people';
import { getSettings } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';

// 'trending' is kept as an alias: older links (Today card) open Highlights → AI.
export type FeedTab = 'people' | 'new' | 'highlights' | 'trending' | 'bluesky';
type HighlightView = 'papers' | 'news' | 'hn' | 'ai';

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'done'; items: T[] };

function failureText(e: unknown) {
  return openAlexHint(e) ?? 'Could not load the feed. Are you online?';
}

async function loadContext(db: Db) {
  const [topics, settings, decisions, people] = await Promise.all([
    listTopics(db),
    getSettings(db),
    getFeedDecisions(db),
    listPeople(db),
  ]);
  return { topics, settings, decisions, people };
}

type Result =
  | {
      key: string;
      ok: true;
      papers: FeedPaper[];
      posts: BlueskyPost[];
      timeline?: Timeline;
      highlights?: Highlights;
    }
  | { key: string; ok: false; message: string };

function fetchFeed(
  tab: FeedTab,
  ctx: Awaited<ReturnType<typeof loadContext>>,
  refresh: boolean
): Promise<{ papers: FeedPaper[]; posts: BlueskyPost[]; timeline?: Timeline; highlights?: Highlights }> {
  if (tab === 'highlights') {
    return loadHighlights(ctx.settings.newsAccounts, refresh).then((highlights) => ({
      papers: [],
      posts: [],
      highlights,
    }));
  }
  if (tab === 'people') {
    return loadTimeline(ctx.people, refresh).then((timeline) => ({ papers: [], posts: [], timeline }));
  }
  if (tab === 'bluesky') {
    return loadBluesky(ctx.settings.blueskySource, ctx.topics, refresh).then((posts) => ({
      papers: [],
      posts,
    }));
  }
  return loadNewPapers(ctx.topics, refresh).then((papers) => ({ papers, posts: [] }));
}

export default function FeedScreen() {
  const params = useLocalSearchParams<{ tab?: FeedTab }>();
  // The tab lives in the route, so the "Today" card can open a specific feed.
  const ctx = useQuery(loadContext);
  // Without anyone followed the people timeline would be empty, so start with "New".
  const asked = params.tab === 'trending' ? 'highlights' : params.tab;
  const tab: FeedTab = asked ?? (ctx && ctx.people.length === 0 ? 'new' : 'people');
  const [sub, setSub] = useState<HighlightView>(params.tab === 'trending' ? 'ai' : 'papers');
  const setTab = (t: FeedTab) => router.setParams({ tab: t });
  const [topicId, setTopicId] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const db = useDb();

  // Once a week per person, look for OpenAlex entries that appeared since following.
  useEffect(() => {
    if (tab === 'people') checkDuePeople(db).catch(() => undefined);
  }, [tab, db]);

  const key = ctx
    ? [
        tab,
        ctx.topics.map((t) => `${t.id}=${t.keywords}`).join(','),
        ctx.settings.blueskySource,
        ctx.settings.newsAccounts,
        peopleKey(ctx.people),
      ].join('|')
    : null;

  // Loads go through a session cache, so re-running after a like costs no request.
  useEffect(() => {
    if (!ctx || !key) return;
    let alive = true;
    fetchFeed(tab, ctx, false)
      .then((r) => alive && setResult({ key, ok: true, ...r }))
      .catch((e: unknown) => alive && setResult({ key, ok: false, message: failureText(e) }));
    return () => {
      alive = false;
    };
  }, [tab, ctx, key]);

  function refresh() {
    if (!ctx || !key) return;
    setRefreshing(true);
    fetchFeed(tab, ctx, true)
      .then((r) => setResult({ key, ok: true, ...r }))
      .catch((e: unknown) => setResult({ key, ok: false, message: failureText(e) }))
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
            <Chip label="People" selected={tab === 'people'} onPress={() => setTab('people')} />
            <Chip label="New" selected={tab === 'new'} onPress={() => setTab('new')} />
            <Chip label="Highlights" selected={tab === 'highlights'} onPress={() => setTab('highlights')} />
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
          {tab === 'people' && ctx.people.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              Papers and Bluesky posts of the {ctx.people.length} people you follow, newest first.
            </ThemedText>
          )}
          {tab === 'highlights' && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row style={styles.noWrap}>
                  <Chip label="Top papers" selected={sub === 'papers'} onPress={() => setSub('papers')} />
                  <Chip label="Science news" selected={sub === 'news'} onPress={() => setSub('news')} />
                  <Chip label="Hacker News" selected={sub === 'hn'} onPress={() => setSub('hn')} />
                  <Chip label="AI trending" selected={sub === 'ai'} onPress={() => setSub('ai')} />
                </Row>
              </ScrollView>
              <ThemedText type="small" themeColor="textSecondary">
                {
                  {
                    papers: 'The most cited papers of the last 30 days, across all of science.',
                    news: 'Science news from Nature, Science and New Scientist on Bluesky (change the accounts in Settings).',
                    hn: 'The most discussed stories on Hacker News this week: tech, AI and science.',
                    ai: 'Hugging Face Daily Papers, most upvoted first: what the ML community reads.',
                  }[sub]
                }
              </ThemedText>
            </>
          )}
          {tab === 'bluesky' && (
            <ThemedText type="small" themeColor="textSecondary">
              {ctx.settings.blueskySource.trim()
                ? 'Your Bluesky accounts or list (set in Settings).'
                : 'Bluesky posts linking to arXiv that match your topic keywords. Add your own accounts or a list in Settings.'}
            </ThemedText>
          )}

          {tab === 'highlights' ? (
            !current ? (
              <FeedMessage text="Loading …" />
            ) : !current.ok ? (
              <FeedMessage text={current.message} onRetry={refresh} />
            ) : (
              <HighlightList h={current.highlights!} sub={sub} decisions={decisions} />
            )
          ) : tab === 'people' ? (
            ctx.people.length === 0 ? (
              <FeedMessage text='Follow researchers in the Brain tab (People) to see their papers and posts here.' />
            ) : !current ? (
              <FeedMessage text="Loading …" />
            ) : !current.ok ? (
              <FeedMessage text={current.message} onRetry={refresh} />
            ) : !current.timeline || current.timeline.items.length === 0 ? (
              <FeedMessage text="Nothing new from the people you follow." />
            ) : (
              current.timeline.items
                .filter((i) => i.kind !== 'paper' || decisions.get(i.paper.id) !== 'down')
                .map((i) => (
                  <TimelineCard
                    key={
                      i.kind === 'post'
                        ? i.post.uri
                        : i.kind === 'web'
                          ? `${i.person.id}:${i.item.id}`
                          : `${i.person.id}:${i.paper.id}`
                    }
                    item={i}
                    avatar={current.timeline!.avatars.get(String(i.person.id))}
                    decisions={decisions}
                  />
                ))
            )
          ) : tab === 'bluesky' ? (
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
            <FeedMessage text={current && !current.ok ? current.message : 'Could not load the feed.'} onRetry={refresh} />
          ) : visiblePapers.length === 0 ? (
            <FeedMessage
              text={
                tab === 'new'
                  ? 'Nothing new. Check the topic keywords in the Brain tab (Topics).'
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

function HighlightList({
  h,
  sub,
  decisions,
}: {
  h: Highlights;
  sub: HighlightView;
  decisions: Map<string, FeedDecision>;
}) {
  if (sub === 'news') {
    return h.news.length ? (
      <>
        {h.news.map((p) => (
          <BlueskyPostCard key={p.uri} post={p} saved={decisions.get(bskyKey(p)) === 'saved'} />
        ))}
      </>
    ) : (
      <FeedMessage text="No news posts could be loaded." />
    );
  }
  if (sub === 'hn') {
    return h.hn.length ? (
      <>
        {h.hn.map((i) => (
          <WebCard key={i.id} item={i} />
        ))}
      </>
    ) : (
      <FeedMessage text="Hacker News could not be loaded." />
    );
  }
  const list = (sub === 'ai' ? h.ai : h.papers).filter((p) => decisions.get(p.id) !== 'down');
  return list.length ? (
    <>
      {list.map((p) => (
        <FeedPaperCard key={p.id} paper={p} decision={decisions.get(p.id)} />
      ))}
    </>
  ) : (
    <FeedMessage text={sub === 'papers' ? 'The top papers could not be loaded (OpenAlex budget?).' : 'Nothing here right now.'} />
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
