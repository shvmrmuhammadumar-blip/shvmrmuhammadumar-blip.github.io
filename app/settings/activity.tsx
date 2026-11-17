import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

const db = supabase as any;

type ActivityTab = 'all' | 'comments' | 'likes' | 'forwards';
type TimeRange = 'all' | 'today' | '7days' | '30days';

type ActivityTarget = {
  id?: string;
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
} | null;

type ActivityRow = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  target_user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  target?: ActivityTarget;
};

type PostInfo = {
  id: string;
  user_id: string;
  caption: string | null;
  media_type: string | null;
  image_url: string | null;
};

const activityTabs: { key: ActivityTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'comments', label: 'Comments' },
  { key: 'likes', label: 'Likes' },
  { key: 'forwards', label: 'Forwards' },
];

const timeRanges: { key: TimeRange; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7days', label: '7 days' },
  { key: '30days', label: '30 days' },
];

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function profileLabel(target?: ActivityTarget) {
  if (!target) return 'a user';
  if (target.username) return `@${target.username}`;
  return target.full_name || 'a user';
}

function describeEvent(item: ActivityRow, post?: PostInfo) {
  const target = profileLabel(item.target);
  const source = item.entity_type === 'post'
    ? post?.media_type === 'video' ? 'a Reel' : 'a post'
    : item.entity_type === 'story' ? 'a story' : 'a message';
  const destination = item.related_entity_type === 'personal_chat'
    ? `to ${target}`
    : item.related_entity_type === 'group'
      ? 'to a group'
      : item.related_entity_type === 'channel'
        ? 'to a channel'
        : '';

  switch (item.event_type) {
    case 'like': return `Liked ${target}'s post`;
    case 'unlike': return `Removed a like from ${target}'s post`;
    case 'comment': return `Commented on ${target}'s post`;
    case 'delete_comment': return `Deleted a comment on ${target}'s post`;
    case 'follow': return `Followed ${target}`;
    case 'unfollow': return `Unfollowed ${target}`;
    case 'forward': return `Forwarded ${source} ${destination}`.trim();
    case 'reel_watch': return 'Watched a Reel';
    case 'post_view': return `Viewed ${target}'s post`;
    case 'story_view': return `Viewed ${target}'s story`;
    case 'create_post': return post?.media_type === 'video' ? 'Published a Reel' : 'Published a post';
    case 'delete_post': return post?.media_type === 'video' ? 'Deleted a Reel' : 'Deleted a post';
    case 'create_story': return 'Published a story';
    case 'delete_story': return 'Deleted a story';
    case 'save_post': return 'Saved a post';
    case 'unsave_post': return 'Removed a saved post';
    case 'send_message': return `Sent a private message to ${target}`;
    case 'send_group_message': return 'Sent a message in a group';
    case 'publish_channel_post': return 'Published in a channel';
    default: return 'Activity recorded';
  }
}

function eventIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (type.includes('like')) return 'heart-outline';
  if (type.includes('comment')) return 'chatbubble-ellipses-outline';
  if (type.includes('follow')) return 'person-add-outline';
  if (type === 'forward') return 'arrow-redo-outline';
  if (type === 'reel_watch') return 'play-circle-outline';
  if (type.includes('view')) return 'eye-outline';
  if (type.includes('story')) return 'albums-outline';
  if (type.includes('message') || type === 'publish_channel_post') return 'chatbubble-outline';
  if (type.includes('save')) return 'bookmark-outline';
  return 'create-outline';
}

function eventColor(type: string) {
  if (type.includes('like')) return colors.like;
  if (type === 'reel_watch' || type === 'post_view' || type === 'story_view') return colors.lime;
  return colors.accent;
}

export default function ActivityHistoryScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActivityTab>('all');
  const [activeTimeRange, setActiveTimeRange] = useState<TimeRange>('all');
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [posts, setPosts] = useState<Record<string, PostInfo>>({});
  const [totalTime, setTotalTime] = useState(0);
  const [reelWatchTime, setReelWatchTime] = useState(0);
  const [stats, setStats] = useState({ reels: 0, likes: 0, comments: 0, forwards: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [eventsResult, sessionsResult, reelWatchResult, reelsResult, likesResult, commentsResult, forwardsResult] = await Promise.all([
          db.from('user_activity_events')
            .select('id, event_type, entity_type, entity_id, target_user_id, related_entity_type, related_entity_id, metadata, occurred_at, target:profiles!user_activity_events_target_user_id_fkey(id, username, full_name, avatar_url)')
            .eq('user_id', userId)
            .order('occurred_at', { ascending: false })
            .limit(1000),
          db.from('user_activity_sessions')
            .select('duration_ms')
            .eq('user_id', userId)
            .limit(10000),
          db.from('creator_content_events')
            .select('watch_ms')
            .eq('viewer_id', userId)
            .eq('content_type', 'post')
            .limit(10000),
          db.from('user_activity_events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('event_type', 'reel_watch'),
          db.from('likes')
            .select('post_id, user_id, created_at', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1000),
          db.from('comments')
            .select('id, post_id, user_id, body, created_at, comment_type', { count: 'exact' })
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1000),
          db.from('user_activity_events')
            .select('id, event_type, entity_type, entity_id, target_user_id, related_entity_type, related_entity_id, metadata, occurred_at')
            .eq('user_id', userId)
            .eq('event_type', 'forward')
            .order('occurred_at', { ascending: false })
            .limit(1000),
        ]);

        for (const result of [eventsResult, sessionsResult, reelWatchResult, reelsResult, likesResult, commentsResult, forwardsResult]) {
          if (result.error) throw result.error;
        }

        const rawEvents = (eventsResult.data ?? []) as ActivityRow[];
        const rawLikes = likesResult.data ?? [];
        const rawComments = commentsResult.data ?? [];
        const rawForwards = (forwardsResult.data ?? []) as ActivityRow[];

        // Likes and comments are read from their source tables. This means
        // unlike/delete operations remove them from this view immediately.
        const nonSocialEvents = rawEvents.filter((item) =>
          !['like', 'unlike', 'comment', 'delete_comment', 'forward'].includes(item.event_type)
        );

        const postIds = [...new Set([
          ...nonSocialEvents.filter((item) => item.entity_type === 'post' && item.entity_id).map((item) => item.entity_id as string),
          ...rawLikes.map((item: any) => item.post_id as string),
          ...rawComments.map((item: any) => item.post_id as string),
          ...rawForwards.filter((item) => item.entity_type === 'post' && item.entity_id).map((item) => item.entity_id as string),
        ])];

        let nextPosts: Record<string, PostInfo> = {};
        if (postIds.length) {
          const postsResult = await db.from('posts')
            .select('id, user_id, caption, media_type, image_url')
            .in('id', postIds);
          if (postsResult.error) throw postsResult.error;
          nextPosts = Object.fromEntries(
            ((postsResult.data ?? []) as PostInfo[]).map((post) => [post.id, post]),
          );
        }

        const targetIds = [...new Set([
          ...Object.values(nextPosts).map((post) => post.user_id),
          ...nonSocialEvents.map((item) => item.target_user_id).filter(Boolean),
          ...rawForwards.map((item) => item.target_user_id).filter(Boolean),
        ] as string[])];

        let targetProfiles: Record<string, NonNullable<ActivityTarget>> = {};
        if (targetIds.length) {
          const profilesResult = await db.from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', targetIds);
          if (profilesResult.error) throw profilesResult.error;
          targetProfiles = Object.fromEntries(
            (profilesResult.data ?? []).map((profile: NonNullable<ActivityTarget>) => [profile.id, profile]),
          );
        }

        const liveLikes: ActivityRow[] = rawLikes.map((item: any) => {
          const post = nextPosts[item.post_id];
          return {
            id: `like:${item.post_id}:${item.created_at}`,
            event_type: 'like',
            entity_type: 'post',
            entity_id: item.post_id,
            target_user_id: post?.user_id ?? null,
            related_entity_type: null,
            related_entity_id: null,
            metadata: {},
            occurred_at: item.created_at,
            target: post?.user_id ? targetProfiles[post.user_id] : null,
          };
        });

        const liveComments: ActivityRow[] = rawComments.map((item: any) => {
          const post = nextPosts[item.post_id];
          return {
            id: `comment:${item.id}`,
            event_type: 'comment',
            entity_type: 'post',
            entity_id: item.post_id,
            target_user_id: post?.user_id ?? null,
            related_entity_type: 'comment',
            related_entity_id: item.id,
            metadata: { comment_body: item.body, comment_type: item.comment_type },
            occurred_at: item.created_at,
            target: post?.user_id ? targetProfiles[post.user_id] : null,
          };
        });

        const liveForwards = rawForwards.map((item) => ({
          ...item,
          target: item.target_user_id ? targetProfiles[item.target_user_id] : null,
        }));

        const normalizedEvents = nonSocialEvents.map((item) => ({
          ...item,
          target: item.target_user_id ? targetProfiles[item.target_user_id] : item.target,
        }));

        const combined = [...normalizedEvents, ...liveLikes, ...liveComments, ...liveForwards]
          .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

        const duration = (sessionsResult.data ?? []).reduce(
          (sum: number, row: { duration_ms: number | string | null }) => sum + Number(row.duration_ms ?? 0),
          0,
        );
        const watchedReelsDuration = (reelWatchResult.data ?? []).reduce(
          (sum: number, row: { watch_ms: number | string | null }) => sum + Number(row.watch_ms ?? 0),
          0,
        );

        if (active) {
          setEvents(combined);
          setPosts(nextPosts);
          setTotalTime(duration);
          setReelWatchTime(watchedReelsDuration);
          setStats({
            reels: reelsResult.count ?? 0,
            likes: likesResult.count ?? 0,
            comments: commentsResult.count ?? 0,
            forwards: forwardsResult.count ?? rawForwards.length,
          });
        }
      } catch (reason) {
        const message = reason && typeof reason === 'object' && 'message' in reason
          ? String((reason as { message?: unknown }).message ?? 'Unknown error')
          : String(reason ?? 'Unknown error');
        if (active) setError(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [userId]));

  const visibleEvents = useMemo(() => {
    let filtered = events;
    if (activeTab !== 'all') {
      const eventType = activeTab === 'comments' ? 'comment' : activeTab === 'likes' ? 'like' : 'forward';
      filtered = filtered.filter((item) => item.event_type === eventType);
    }

    if (activeTimeRange !== 'all') {
      const now = new Date();
      const cutoff = new Date(now);
      if (activeTimeRange === 'today') cutoff.setHours(0, 0, 0, 0);
      if (activeTimeRange === '7days') cutoff.setDate(cutoff.getDate() - 7);
      if (activeTimeRange === '30days') cutoff.setDate(cutoff.getDate() - 30);
      filtered = filtered.filter((item) => new Date(item.occurred_at).getTime() >= cutoff.getTime());
    }

    return filtered;
  }, [events, activeTab, activeTimeRange]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Your activity', headerShown: true }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.heading}>
          <Text style={styles.kicker}>YOUR LUMO HISTORY</Text>
          <Text style={styles.title}>Your activity</Text>
          <Text style={styles.subtitle}>A private timeline of your actions and time spent in Lumo.</Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard icon="time-outline" label="Time in Lumo" value={formatDuration(totalTime)} />
          <StatCard icon="play-circle-outline" label="Reels watched" value={String(stats.reels)} />
          <StatCard icon="hourglass-outline" label="Reels watch time" value={formatDuration(reelWatchTime)} />
          <StatCard icon="heart-outline" label="Likes given" value={String(stats.likes)} />
          <StatCard icon="chatbubble-ellipses-outline" label="Comments written" value={String(stats.comments)} />
          <StatCard icon="arrow-redo-outline" label="Forwards" value={String(stats.forwards)} />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity history</Text>
          <Text style={styles.sectionMeta}>{visibleEvents.length} items</Text>
        </View>

        <Text style={styles.timeFilterLabel}>TIME RANGE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timeFilters}
        >
          {timeRanges.map((range) => {
            const selected = activeTimeRange === range.key;
            return (
              <Pressable
                key={range.key}
                onPress={() => setActiveTimeRange(range.key)}
                style={[styles.timeRangeChip, selected && styles.timeRangeChipActive]}
              >
                <Text style={[styles.timeRangeText, selected && styles.timeRangeTextActive]}>
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {activityTabs.map((tab) => {
            const selected = activeTab === tab.key;
            const count = tab.key === 'comments'
              ? stats.comments
              : tab.key === 'likes'
                ? stats.likes
                : tab.key === 'forwards'
                  ? stats.forwards
                  : null;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.filter, selected && styles.filterActive]}
              >
                <Text style={[styles.filterText, selected && styles.filterTextActive]}>
                  {count === null ? tab.label : `${tab.label} ${count}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.lime} />
            <Text style={styles.stateText}>Loading your activity…</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyCard}>
            <Ionicons name="alert-circle-outline" size={26} color={colors.like} />
            <Text style={styles.emptyTitle}>Activity could not be loaded</Text>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : visibleEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="time-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>
              {activeTab === 'comments'
                ? 'No comments in this time range'
                : activeTab === 'likes'
                  ? 'No liked posts in this time range'
                  : activeTab === 'forwards'
                    ? 'No forwards in this time range'
                    : 'No activity in this time range'}
            </Text>
            <Text style={styles.stateText}>Choose another time range or keep using Lumo. New activity will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {visibleEvents.map((item, index) => {
              const post = item.entity_id ? posts[item.entity_id] : undefined;
              const description = describeEvent(item, post);
              const commentBody = typeof item.metadata?.comment_body === 'string'
                ? item.metadata.comment_body.trim()
                : '';
              const secondaryText = item.event_type === 'comment'
                ? commentBody
                : post?.caption?.trim() ?? '';
              const canOpenPost = item.entity_type === 'post' && !!item.entity_id;
              const time = formatDate(item.occurred_at);

              return (
                <Pressable
                  key={item.id}
                  disabled={!canOpenPost}
                  onPress={() => item.entity_id && router.push(`/post/${item.entity_id}`)}
                  style={({ pressed }) => [
                    styles.eventRow,
                    index === visibleEvents.length - 1 && styles.eventRowLast,
                    pressed && styles.eventPressed,
                  ]}
                >
                  <View style={[styles.eventIcon, { backgroundColor: `${eventColor(item.event_type)}18` }]}>
                    <Ionicons name={eventIcon(item.event_type)} size={17} color={eventColor(item.event_type)} />
                  </View>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventTitle}>{description}</Text>
                    {secondaryText ? <Text style={styles.eventCaption} numberOfLines={2}>{secondaryText}</Text> : null}
                    <Text style={styles.eventTime}>{time}</Text>
                  </View>
                  {canOpenPost ? <Ionicons name="chevron-forward" size={16} color={colors.dim} /> : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.privacyNote}>
          Only you can view this history. Private message text is not stored in the activity log.
        </Text>
      </ScrollView>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={17} color={colors.lime} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 36 },
  heading: { marginBottom: 18 },
  kicker: { color: colors.lime, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 420 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', flexGrow: 1, minHeight: 112, borderRadius: 16, padding: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 10 },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionMeta: { color: colors.dim, fontSize: 10, fontWeight: '700' },
  timeFilterLabel: { color: colors.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 7 },
  timeFilters: { gap: 7, paddingBottom: 11 },
  timeRangeChip: { minHeight: 30, paddingHorizontal: 11, borderRadius: 15, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  timeRangeChipActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.lime },
  timeRangeText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  timeRangeTextActive: { color: colors.lime },
  filters: { gap: 7, paddingBottom: 14 },
  filter: { minHeight: 38, paddingHorizontal: 14, borderRadius: 13, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterActive: { backgroundColor: colors.lime, borderColor: colors.lime },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  filterTextActive: { color: colors.bg },
  timeline: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  eventRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 12 },
  eventRowLast: { borderBottomWidth: 0 },
  eventPressed: { opacity: 0.7 },
  eventIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  eventCopy: { flex: 1, minWidth: 0, gap: 4 },
  eventTitle: { color: colors.text, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  eventCaption: { color: colors.muted, fontSize: 10 },
  eventTime: { color: colors.dim, fontSize: 9 },
  centerState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyCard: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 20, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  stateText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  privacyNote: { color: colors.dim, fontSize: 9, lineHeight: 15, textAlign: 'center', marginTop: 20, paddingHorizontal: 18 },
});
