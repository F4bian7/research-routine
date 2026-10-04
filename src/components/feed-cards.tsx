import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { openUrl } from '@/components/link-button';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { paperFromPost, readFeedPaper, saveFeedPaper } from '@/data/feeds';
import { useDb } from '@/db/db';
import { type FeedDecision, setFeedDecision } from '@/db/repos/feed';
import type { Topic } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';
import type { TimelineItem } from '@/data/people';
import type { BlueskyPost, FeedPaper } from '@/sources/feed-types';
import type { WebItem } from '@/sources/web';

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'now';
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

export function FeedPaperCard({
  paper,
  topic,
  decision,
}: {
  paper: FeedPaper;
  topic?: Topic;
  decision?: FeedDecision;
}) {
  const db = useDb();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const meta = [paper.venue, paper.date, paper.authors].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.topRow}>
        {topic && <View style={[styles.swatch, { backgroundColor: topic.color }]} />}
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
          {meta}
        </ThemedText>
        {paper.upvotes !== undefined && (
          <ThemedText type="smallBold" themeColor="textSecondary">
            ▲ {paper.upvotes}
          </ThemedText>
        )}
        <Pressable onPress={() => openUrl(paper.url)} hitSlop={12} accessibilityLabel="Open original">
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            ↗
          </ThemedText>
        </Pressable>
      </View>
      <ThemedText type="smallBold" style={styles.title}>
        {paper.title}
      </ThemedText>
      {paper.abstract ? (
        <Pressable onPress={() => setOpen(!open)}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={open ? undefined : 3}>
            {paper.abstract}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.accent }}>
            {open ? 'Less' : 'More'}
          </ThemedText>
        </Pressable>
      ) : null}
      <Row>
        <Chip label="Read" selected={false} onPress={() => readFeedPaper(db, paper)} />
        <Chip
          label={decision === 'saved' ? 'In backlog ✓' : '+ Backlog'}
          selected={decision === 'saved'}
          onPress={() => saveFeedPaper(db, paper)}
        />
        <Chip
          label="👍"
          selected={decision === 'up'}
          onPress={() => setFeedDecision(db, paper.id, decision === 'up' ? null : 'up')}
        />
        <Chip label="👎" selected={false} onPress={() => setFeedDecision(db, paper.id, 'down')} />
      </Row>
    </View>
  );
}

export function bskyKey(post: BlueskyPost) {
  return `bsky:${post.uri}`;
}

export function BlueskyPostCard({ post, saved }: { post: BlueskyPost; saved: boolean }) {
  const db = useDb();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  async function withPaper(action: 'save' | 'read') {
    setBusy(true);
    try {
      const paper = await paperFromPost(post);
      if (!paper) return;
      await setFeedDecision(db, bskyKey(post), 'saved');
      if (action === 'save') await saveFeedPaper(db, paper);
      else await readFeedPaper(db, paper);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.topRow}>
        {post.avatar ? <Image source={{ uri: post.avatar }} style={styles.avatar} /> : null}
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {post.author}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            @{post.handle} · {relativeTime(post.createdAt)}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small">{post.text}</ThemedText>
      {post.link ? (
        <Pressable
          onPress={() => openUrl(post.link!.uri)}
          style={[styles.linkCard, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {post.link.title || post.link.uri}
          </ThemedText>
          {post.link.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {post.link.description}
            </ThemedText>
          ) : null}
        </Pressable>
      ) : null}
      {post.image ? <Image source={{ uri: post.image }} style={styles.image} /> : null}
      <Row>
        {post.paperUrl ? (
          <>
            <Chip label="Read" selected={false} onPress={() => withPaper('read')} />
            <Chip
              label={saved ? 'In backlog ✓' : '+ Backlog'}
              selected={saved}
              onPress={() => withPaper('save')}
            />
          </>
        ) : null}
        <Chip label="Bluesky ↗" selected={false} onPress={() => openUrl(post.url)} />
      </Row>
      {busy ? (
        <ThemedText type="small" themeColor="textSecondary">
          Looking up the paper …
        </ThemedText>
      ) : null}
    </View>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// A people-feed entry: who did what, then the paper or post itself.
export function TimelineCard({
  item,
  avatar,
  decisions,
}: {
  item: TimelineItem;
  avatar?: string;
  decisions: Map<string, FeedDecision>;
}) {
  const theme = useTheme();
  const what =
    item.kind === 'paper'
      ? 'published a paper'
      : item.kind === 'post'
        ? 'posted on Bluesky'
        : item.item.source === 'blog'
          ? 'wrote a blog post'
          : item.item.source === 'github'
            ? 'started a GitHub project'
            : 'is discussed on Hacker News';
  return (
    <View style={styles.timeline}>
      <Pressable
        onPress={() => router.push({ pathname: '/person/[id]', params: { id: String(item.person.id) } })}
        style={styles.topRow}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.initials, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">{initials(item.person.name)}</ThemedText>
          </View>
        )}
        <ThemedText type="small" style={styles.flex}>
          <ThemedText type="smallBold">{item.person.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            {what} · {relativeTime(item.at)}
          </ThemedText>
        </ThemedText>
      </Pressable>
      {item.kind === 'paper' ? (
        <FeedPaperCard paper={item.paper} decision={decisions.get(item.paper.id)} />
      ) : item.kind === 'post' ? (
        <BlueskyPostCard post={item.post} saved={decisions.get(bskyKey(item.post)) === 'saved'} />
      ) : (
        <WebCard item={item.item} />
      )}
    </View>
  );
}

const SOURCE_LABEL = { blog: 'Blog', github: 'GitHub', hn: 'Hacker News' } as const;

// A blog post, GitHub project or Hacker News story.
export function WebCard({ item }: { item: WebItem }) {
  const theme = useTheme();
  const meta = [
    SOURCE_LABEL[item.source],
    relativeTime(item.at),
    item.points !== undefined ? (item.source === 'github' ? `★ ${item.points}` : `▲ ${item.points}`) : '',
    item.comments ? `${item.comments} comments` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {meta}
      </ThemedText>
      <Pressable onPress={() => openUrl(item.url)}>
        <ThemedText type="smallBold" style={styles.title}>
          {item.title} ↗
        </ThemedText>
      </Pressable>
      {item.summary ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          {item.summary}
        </ThemedText>
      ) : null}
      {item.discussion && item.discussion !== item.url ? (
        <Pressable onPress={() => openUrl(item.discussion!)}>
          <ThemedText type="small" style={{ color: theme.accent }}>
            Read the discussion ↗
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FeedMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.message}>
      <ThemedText themeColor="textSecondary">{text}</ThemedText>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1 },
  title: { fontSize: 16, lineHeight: 22 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  linkCard: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.half },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: Spacing.two },
  message: { gap: Spacing.two, paddingVertical: Spacing.three },
  timeline: { gap: Spacing.two },
  initials: { alignItems: 'center', justifyContent: 'center' },
});
