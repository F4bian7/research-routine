import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BlueskyPostCard,
  bskyKey,
  FeedMessage,
  FeedPaperCard,
  paperInput,
  postInput,
  WebCard,
  webInput,
} from '@/components/feed-cards';
import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  blueskyActor,
  checkProfiles,
  needsCheck,
  peopleKey,
  resolvePending,
  webForPerson,
  worksForPeople,
} from '@/data/people';
import { useBriefs } from '@/data/use-briefs';
import { useQuery } from '@/data/use-query';
import { type Db, useDb } from '@/db/db';
import { getFeedDecisions } from '@/db/repos/feed';
import { listNotes } from '@/db/repos/notes';
import { getPerson } from '@/db/repos/people';
import { getSettings } from '@/db/repos/settings';
import { listTopics } from '@/db/repos/topics';
import type { PersonLinks } from '@/db/types';
import { LINK_LABEL, linkFor, scholarSearchUrl } from '@/domain/person-links';
import { useTheme } from '@/hooks/use-theme';
import { followedPosts } from '@/sources/bluesky';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import type { WebItem } from '@/sources/web';


type Loaded<T> = { key: string; items: T[] | null }; // items null = failed

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: '/brain', params: { view: 'people' } });
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const db = useDb();
  const load = useCallback(
    async (d: Db) => {
      const [person, topics, decisions, notes] = await Promise.all([
        getPerson(d, Number(id)),
        listTopics(d),
        getFeedDecisions(d),
        listNotes(d),
      ]);
      return {
        person,
        topics,
        decisions,
        notes: notes.filter((n) => n.personIds.includes(Number(id))),
        hasKey: !!(await getSettings(d)).geminiApiKey,
      };
    },
    [id]
  );
  const data = useQuery(load);
  const [chosenTab, setTab] = useState<'papers' | 'bluesky' | 'web' | null>(null);
  const [web, setWeb] = useState<Loaded<WebItem> | null>(null);
  const [papers, setPapers] = useState<Loaded<FeedPaper> | null>(null);
  const [posts, setPosts] = useState<Loaded<BlueskyPost> | null>(null);

  const person0 = data?.person ?? null;
  const authorKey = person0 && (person0.openalexIds.length || person0.orcid) ? peopleKey([person0]) : null;
  const handle = person0 ? blueskyActor(person0) : null;
  // People without papers (bloggers, engineers) open on what they do elsewhere.
  const tab = chosenTab ?? (authorKey ? 'papers' : 'web');
  const webKey = person0 ? `${person0.id}:${person0.links.github ?? ''}:${person0.links.blog ?? ''}:${person0.openalexIds.length}` : null;

  useEffect(() => {
    if (!person0 || !webKey || tab !== 'web') return;
    let alive = true;
    webForPerson(person0)
      .then((items) => alive && setWeb({ key: webKey, items }))
      .catch(() => alive && setWeb({ key: webKey, items: null }));
    return () => {
      alive = false;
    };
    // Refetch when the person's web sources change, not on other edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webKey, tab]);

  useEffect(() => {
    if (!person0 || !authorKey) return;
    let alive = true;
    worksForPeople([person0], 25)
      .then((items) => alive && setPapers({ key: authorKey, items }))
      .catch(() => alive && setPapers({ key: authorKey, items: null }));
    return () => {
      alive = false;
    };
    // Refetch when the linked profiles change, not on every other edit of the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorKey]);

  // Look for new OpenAlex entries of this person at most once a week.
  useEffect(() => {
    if (person0 && person0.openalexIds.length > 0 && needsCheck(person0)) {
      checkProfiles(db, person0).catch(() => undefined);
    }
  }, [person0, db]);

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

  // Plain-language briefs for what is shown in the current tab.
  const shownPapers = papers?.key === authorKey ? (papers.items ?? []) : [];
  const shownPosts = posts?.key === handle ? (posts.items ?? []) : [];
  const shownWeb = web?.key === webKey ? (web.items ?? []) : [];
  const briefInputs =
    tab === 'papers' ? shownPapers.map(paperInput) : tab === 'web' ? shownWeb.map(webInput) : shownPosts.map(postInput);
  const { briefs } = useBriefs(briefInputs, !!data?.hasKey);

  if (!data) return <ThemedView style={styles.container} />;
  const { person, topics, decisions, notes } = data;

  const linkKinds = (Object.keys(LINK_LABEL) as (keyof PersonLinks)[]).filter((k) => person?.links[k]);
  const currentPapers = papers?.key === authorKey ? papers.items : undefined;
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

            {person.pendingProfiles.map((c) => (
              <View key={c.id} style={[styles.pending, { borderColor: theme.accent }]}>
                <ThemedText type="smallBold">New entry found. Is this {person.name} too?</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {[c.name, c.institutions.slice(0, 2).join(', '), `${c.works} papers`, c.topic]
                    .filter(Boolean)
                    .join(' · ')}
                </ThemedText>
                <Row>
                  <Button label="Same person" variant="primary" onPress={() => resolvePending(db, person, c.id, true)} />
                  <Button label="Someone else" variant="ghost" onPress={() => resolvePending(db, person, c.id, false)} />
                </Row>
              </View>
            ))}

            {person.openalexIds.length > 0 || person.orcid ? (
            <ThemedText type="small" themeColor="textSecondary">
              {[
                person.openalexIds.length === 1
                  ? 'Papers from 1 OpenAlex entry'
                  : `Papers from ${person.openalexIds.length} OpenAlex entries`,
                person.orcid ? 'plus everything under their ORCID' : '',
                'checked for new entries weekly',
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </ThemedText>
            ) : null}

            {notes.length > 0 && (
              <View style={styles.notes}>
                <ThemedText type="smallBold">Your notes ({notes.length})</ThemedText>
                {notes.map((n) => (
                  <Pressable
                    key={n.id}
                    onPress={() => router.push({ pathname: '/note/[id]', params: { id: String(n.id) } })}>
                    <ThemedText style={{ color: theme.accent }}>{n.title}</ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

            <Row>
              <Chip label="Papers" selected={tab === 'papers'} onPress={() => setTab('papers')} />
              <Chip label="Bluesky" selected={tab === 'bluesky'} onPress={() => setTab('bluesky')} />
              <Chip label="Web" selected={tab === 'web'} onPress={() => setTab('web')} />
            </Row>

            {tab === 'papers' ? (
              !authorKey ? (
                <FeedMessage text='Not linked to OpenAlex yet. Tap "Edit", then "Find papers on OpenAlex".' />
              ) : currentPapers === undefined ? (
                <FeedMessage text="Loading …" />
              ) : currentPapers === null ? (
                <FeedMessage text="Could not load the papers. Are you online?" />
              ) : currentPapers.length === 0 ? (
                <FeedMessage text="No papers found." />
              ) : (
                currentPapers.map((p) => (
                  <FeedPaperCard key={p.id} paper={p} decision={decisions.get(p.id)} brief={briefs.get(p.id)} />
                ))
              )
            ) : tab === 'web' ? (
              web?.key !== webKey ? (
                <FeedMessage text="Loading …" />
              ) : web.items === null || web.items.length === 0 ? (
                <FeedMessage
                  text={
                    person.links.github || person.links.blog || person.openalexIds.length === 0
                      ? 'Nothing recent from their blog, GitHub or Hacker News.'
                      : 'Add a GitHub user or a blog feed (Edit) to see what they publish outside papers.'
                  }
                />
              ) : (
                web.items.map((i) => <WebCard key={i.id} item={i} brief={briefs.get(i.id)} />)
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
                <BlueskyPostCard
                  key={p.uri}
                  post={p}
                  saved={decisions.get(bskyKey(p)) === 'saved'}
                  brief={briefs.get(bskyKey(p))}
                />
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
  notes: { gap: Spacing.one },
  pending: { borderWidth: 1.5, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
