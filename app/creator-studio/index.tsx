import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { formatStudioNumber, getPeriodStart, loadStudioOverview, type StudioOverview } from '../../lib/studio-data';
import { colors } from '../../lib/theme';
import { getStudioBodyWidth } from '../../lib/responsive';
import { useThemedStyles } from "../../lib/theme-styles";

type Period = '7d' | '30d' | '90d';
type Person = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};
type FollowerRow = { created_at: string; person: Person | null };
type CommentRow = {
  id: string;
  post_id: string;
  body: string | null;
  created_at: string;
  person: Pick<Person, 'id' | 'username' | 'avatar_url'> | null;
};
type PostRow = {
  id: string;
  caption: string | null;
  media_type: string;
  created_at: string;
  image_url: string | null;
  video_url: string | null;
};
type EventRow = {
  viewer_id: string;
  content_id: string;
  content_type: 'post' | 'story';
  occurred_at: string;
  watch_ms: number;
  content_duration_ms: number;
  event_type: 'open' | 'complete';
};
type PlanRow = { id: string; title: string; scheduled_at: string | null; status: string };
type TopPost = PostRow & { opens: number; likes: number; comments: number };
type ChartBucket = { opens: number; followers: number };

const periodOptions: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];
const emptyOverview: StudioOverview = {
  posts: 0,
  followers: 0,
  following: 0,
  accountType: 'personal',
  category: null,
  likes: 0,
  postOpens: 0,
  storyOpens: 0,
  uniqueViewers: 0,
  recentPosts: [],
};

function startOfPeriod(period: Period) {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (days - 1));
  return date;
}

function buildBuckets(events: EventRow[], followers: { created_at: string }[], period: Period): ChartBucket[] {
  const spanDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const count = period === '7d' ? 7 : period === '30d' ? 15 : 18;
  const daysPerBucket = Math.ceil(spanDays / count);
  const start = startOfPeriod(period);
  const buckets = Array.from({ length: count }, () => ({ opens: 0, followers: 0 }));
  const add = (iso: string, key: 'opens' | 'followers') => {
    const date = new Date(iso);
    date.setHours(0, 0, 0, 0);
    const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
    const index = Math.floor(day / daysPerBucket);
    if (index >= 0 && index < buckets.length) buckets[index][key] += 1;
  };
  events.forEach((event) => add(event.occurred_at, 'opens'));
  followers.forEach((follower) => add(follower.created_at, 'followers'));
  return buckets;
}

export default function StudioOverviewScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const userId = session?.user.id ?? '';
  const [period, setPeriod] = useState<Period>('30d');
  const [overview, setOverview] = useState<StudioOverview>(emptyOverview);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [followerRows, setFollowerRows] = useState<{ created_at: string }[]>([]);
  const [recentFollowers, setRecentFollowers] = useState<FollowerRow[]>([]);
  const [recentComments, setRecentComments] = useState<CommentRow[]>([]);
  const [upcomingPlans, setUpcomingPlans] = useState<PlanRow[]>([]);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [periodLikes, setPeriodLikes] = useState(0);
  const [periodComments, setPeriodComments] = useState(0);
  const [publishedInPeriod, setPublishedInPeriod] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [newFollowers, setNewFollowers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const since = getPeriodStart(period) ?? startOfPeriod(period).toISOString();
    const now = new Date().toISOString();

    const [
      overviewResult,
      eventResult,
      followerResult,
      recentFollowerResult,
      commentsResult,
      plansResult,
      likeResult,
      commentCountResult,
      postsPeriodResult,
      storiesPeriodResult,
      postsResult,
    ] = await Promise.all([
      loadStudioOverview(userId),
      supabase.from('creator_content_events')
        .select('viewer_id, content_id, content_type, occurred_at, watch_ms, content_duration_ms, event_type', { count: 'exact' })
        .eq('owner_id', userId)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: true })
        .limit(2000),
      supabase.from('follows')
        .select('created_at', { count: 'exact' })
        .eq('following_id', userId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(2000),
      supabase.from('follows')
        .select('created_at, person:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)')
        .eq('following_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('comments')
        .select('id, post_id, body, created_at, person:profiles!comments_user_id_fkey(id, username, avatar_url), post:posts!comments_post_id_fkey!inner(user_id)')
        .eq('post.user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase.from('creator_plans')
        .select('id, title, scheduled_at, status')
        .eq('user_id', userId)
        .eq('status', 'planned')
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(3),
      supabase.from('likes')
        .select('post_id, posts!inner(user_id)', { count: 'exact', head: true })
        .eq('posts.user_id', userId)
        .gte('created_at', since),
      supabase.from('comments')
        .select('id, posts!inner(user_id)', { count: 'exact', head: true })
        .eq('posts.user_id', userId)
        .gte('created_at', since),
      supabase.from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase.from('stories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase.from('posts')
        .select('id, caption, media_type, created_at, image_url, video_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const results = [
      eventResult, followerResult, recentFollowerResult, commentsResult, plansResult,
      likeResult, commentCountResult, postsPeriodResult, storiesPeriodResult, postsResult,
    ];
    for (const result of results) {
      if (result.error) throw result.error;
    }

    const loadedEvents = (eventResult.data ?? []) as EventRow[];
    const loadedFollowers = (followerResult.data ?? []) as { created_at: string }[];
    const loadedPosts = (postsResult.data ?? []) as PostRow[];
    const loadedRecentFollowers = (recentFollowerResult.data ?? []) as unknown as FollowerRow[];
    const loadedComments = (commentsResult.data ?? []).map((item: any) => ({
      id: item.id,
      post_id: item.post_id,
      body: item.body,
      created_at: item.created_at,
      person: item.person ?? null,
    })) as CommentRow[];

    const openCounts = new Map<string, number>();
    loadedEvents.forEach((event) => {
      if (event.content_type === 'post') {
        openCounts.set(event.content_id, (openCounts.get(event.content_id) ?? 0) + 1);
      }
    });
    const ranked = [...loadedPosts].sort((a, b) =>
      (openCounts.get(b.id) ?? 0) - (openCounts.get(a.id) ?? 0) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ).slice(0, 5);
    const rankedIds = ranked.map((post) => post.id);

    let likesByPost = new Map<string, number>();
    let commentsByPost = new Map<string, number>();
    if (rankedIds.length) {
      const [postLikes, postComments] = await Promise.all([
        supabase.from('likes').select('post_id').in('post_id', rankedIds),
        supabase.from('comments').select('post_id').in('post_id', rankedIds),
      ]);
      if (postLikes.error) throw postLikes.error;
      if (postComments.error) throw postComments.error;
      likesByPost = new Map<string, number>();
      commentsByPost = new Map<string, number>();
      (postLikes.data ?? []).forEach((row) => likesByPost.set(row.post_id, (likesByPost.get(row.post_id) ?? 0) + 1));
      (postComments.data ?? []).forEach((row) => commentsByPost.set(row.post_id, (commentsByPost.get(row.post_id) ?? 0) + 1));
    }

    setOverview(overviewResult);
    setEvents(loadedEvents);
    setFollowerRows(loadedFollowers);
    setRecentFollowers(loadedRecentFollowers);
    setRecentComments(loadedComments);
    setUpcomingPlans((plansResult.data ?? []) as PlanRow[]);
    setPeriodLikes(likeResult.count ?? 0);
    setPeriodComments(commentCountResult.count ?? 0);
    setPublishedInPeriod((postsPeriodResult.count ?? 0) + (storiesPeriodResult.count ?? 0));
    setEventTotal(eventResult.count ?? 0);
    setNewFollowers(followerResult.count ?? 0);
    setTopPosts(ranked.map((post) => ({
      ...post,
      opens: openCounts.get(post.id) ?? 0,
      likes: likesByPost.get(post.id) ?? 0,
      comments: commentsByPost.get(post.id) ?? 0,
    })));
    setError('');
  }, [period, userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Dashboard could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]));

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dashboard could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  };

  const chart = useMemo(() => buildBuckets(events, followerRows, period), [events, followerRows, period]);
  const chartMax = Math.max(1, ...chart.map((bucket) => Math.max(bucket.opens, bucket.followers)));
  const uniqueViewers = new Set(events.map((event) => event.viewer_id)).size;
  const interactions = periodLikes + periodComments;
  const contentWidth = getStudioBodyWidth(width);
  const isWide = contentWidth >= 980;
  const accountLabel = overview.accountType === 'business' ? 'BUSINESS' : overview.accountType === 'creator' ? 'CREATOR' : 'PERSONAL';
  const firstDay = startOfPeriod(period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <StudioFrame title="Dashboard" subtitle={accountLabel + ' workspace'} icon="grid-outline" wide>
      <View style={lumoStyles.commandRow}>
        <View style={lumoStyles.commandLeft}>
          <View style={lumoStyles.liveMark} />
          <Text style={lumoStyles.commandTitle}>Performance overview</Text>
          <View style={lumoStyles.accountTypePill}>
            <Text style={lumoStyles.accountTypeText}>{accountLabel}</Text>
          </View>
        </View>
        <View style={lumoStyles.commandActions}>
          <View style={lumoStyles.periodControl}>
            {periodOptions.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setPeriod(item.key)}
                style={[lumoStyles.periodButton, period === item.key && lumoStyles.periodButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: period === item.key }}
              >
                <Text style={[lumoStyles.periodText, period === item.key && lumoStyles.periodTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => void refresh()} style={lumoStyles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh dashboard">
            {refreshing ? <ActivityIndicator size="small" color={colors.accentStrong} /> : <Ionicons name="refresh-outline" size={17} color={colors.text} />}
          </Pressable>
        </View>
      </View>

      {error ? (
        <StudioPanel style={lumoStyles.errorPanel}>
          <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
          <Text style={lumoStyles.errorText}>{error}</Text>
        </StudioPanel>
      ) : null}

      <View style={lumoStyles.metricGrid}>
        <StudioPanel style={lumoStyles.metricCard}>
          <View style={lumoStyles.metricTop}>
            <View style={lumoStyles.metricIcon}><Ionicons name="people-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={lumoStyles.metricHint}>AUDIENCE</Text>
            <Ionicons name="trending-up-outline" size={16} color={colors.success} />
          </View>
          <Text style={lumoStyles.metricValue}>{formatStudioNumber(overview.followers)}</Text>
          <View style={lumoStyles.metricBottom}>
            <Text style={lumoStyles.metricLabel}>Followers</Text>
            <Text style={lumoStyles.metricDelta}>+{formatStudioNumber(newFollowers)} in range</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={lumoStyles.metricCard}>
          <View style={lumoStyles.metricTop}>
            <View style={lumoStyles.metricIcon}><Ionicons name="eye-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={lumoStyles.metricHint}>DISCOVERY</Text>
            <Ionicons name="pulse-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={lumoStyles.metricValue}>{formatStudioNumber(eventTotal)}</Text>
          <View style={lumoStyles.metricBottom}>
            <Text style={lumoStyles.metricLabel}>Views</Text>
            <Text style={lumoStyles.metricSub}>{formatStudioNumber(uniqueViewers)} unique viewers · post, story + video activity</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={lumoStyles.metricCard}>
          <View style={lumoStyles.metricTop}>
            <View style={lumoStyles.metricIcon}><Ionicons name="heart-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={lumoStyles.metricHint}>INTERACTIONS</Text>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={lumoStyles.metricValue}>{formatStudioNumber(interactions)}</Text>
          <View style={lumoStyles.metricBottom}>
            <Text style={lumoStyles.metricLabel}>Likes + comments</Text>
            <Text style={lumoStyles.metricSub}>{formatStudioNumber(periodLikes)} likes · {formatStudioNumber(periodComments)} comments</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={lumoStyles.metricCard}>
          <View style={lumoStyles.metricTop}>
            <View style={lumoStyles.metricIcon}><Ionicons name="images-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={lumoStyles.metricHint}>PUBLISHING</Text>
            <Ionicons name="albums-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={lumoStyles.metricValue}>{formatStudioNumber(overview.posts)}</Text>
          <View style={lumoStyles.metricBottom}>
            <Text style={lumoStyles.metricLabel}>Published posts</Text>
            <Text style={lumoStyles.metricSub}>{formatStudioNumber(publishedInPeriod)} posts & stories in range</Text>
          </View>
        </StudioPanel>
      </View>

      <View style={[lumoStyles.mainGrid, isWide && lumoStyles.mainGridWide]}>
        <View style={[lumoStyles.primaryColumn, isWide && lumoStyles.primaryColumnWide]}>
          <StudioPanel style={lumoStyles.chartPanel}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="analytics-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={lumoStyles.panelTitle}>Account activity</Text>
                  <Text style={lumoStyles.panelMeta}>{firstDay} — today</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/analytics')} style={lumoStyles.viewAllButton} accessibilityRole="button">
                <Text style={lumoStyles.viewAllText}>Details</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
              </Pressable>
            </View>
            {loading ? (
              <View style={lumoStyles.chartLoading}><ActivityIndicator color={colors.accentStrong} /></View>
            ) : (
              <>
                <View style={lumoStyles.chartLegend}>
                  <View style={lumoStyles.legendItem}><View style={lumoStyles.legendOpen} /><Text style={lumoStyles.legendText}>Content opens</Text></View>
                  <View style={lumoStyles.legendItem}><View style={lumoStyles.legendFollower} /><Text style={lumoStyles.legendText}>New followers</Text></View>
                </View>
                <View style={lumoStyles.chartArea}>
                  <View style={lumoStyles.chartGuides}>
                    <View style={lumoStyles.chartGuide} />
                    <View style={lumoStyles.chartGuide} />
                    <View style={lumoStyles.chartGuide} />
                    <View style={lumoStyles.chartGuide} />
                  </View>
                  <View style={lumoStyles.chartBars}>
                    {chart.map((bucket, index) => (
                      <View key={index} style={lumoStyles.chartColumn}>
                        <View style={lumoStyles.chartBarGroup}>
                          <View style={[lumoStyles.chartBarOpen, { height: Math.max(3, (bucket.opens / chartMax) * 168) }]} />
                          <View style={[lumoStyles.chartBarFollower, { height: Math.max(3, (bucket.followers / chartMax) * 168) }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={lumoStyles.chartAxis}>
                  <Text style={lumoStyles.axisText}>{period === '7d' ? '7 days ago' : period === '30d' ? '30 days ago' : '90 days ago'}</Text>
                  <Text style={lumoStyles.axisText}>Today</Text>
                </View>
                {eventTotal === 0 && newFollowers === 0 ? (
                  <View style={lumoStyles.chartEmpty}>
                    <Text style={lumoStyles.chartEmptyText}>Activity will appear as people view content and follow your profile.</Text>
                  </View>
                ) : null}
              </>
            )}
          </StudioPanel>

          <StudioPanel style={lumoStyles.contentPanel}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="trophy-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={lumoStyles.panelTitle}>Top content</Text>
                  <Text style={lumoStyles.panelMeta}>{eventTotal > 0 ? 'Ranked by recorded views' : 'Recent posts · early activity data'}</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/content')} style={lumoStyles.viewAllButton} accessibilityRole="button">
                <Text style={lumoStyles.viewAllText}>Library</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
              </Pressable>
            </View>
            <View style={lumoStyles.tableHeader}>
              <Text style={[lumoStyles.tableHeading, lumoStyles.postHeading]}>CONTENT</Text>
              <Text style={lumoStyles.tableHeading}>VIEWS</Text>
              <Text style={lumoStyles.tableHeading}>LIKES</Text>
              <Text style={lumoStyles.tableHeading}>COMMENTS</Text>
            </View>
            {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 18 }} /> : null}
            {!loading && !topPosts.length ? (
              <View style={lumoStyles.tableEmpty}>
                <Ionicons name="images-outline" size={20} color={colors.dim} />
                <Text style={lumoStyles.tableEmptyText}>Your published content will appear here.</Text>
                <Pressable onPress={() => router.push('/create')} style={lumoStyles.createInline}>
                  <Ionicons name="add" size={15} color={colors.bg} />
                  <Text style={lumoStyles.createInlineText}>Create</Text>
                </Pressable>
              </View>
            ) : null}
            {topPosts.map((post, index) => (
              <Pressable key={post.id} onPress={() => router.push((post.media_type === 'video' || post.video_url ? '/creator-studio/video/' : '/post/') + post.id)} style={lumoStyles.contentRow} accessibilityRole="button">
                <Text style={lumoStyles.rank}>{index + 1}</Text>
                {post.image_url ? (
                  <Image source={{ uri: post.image_url }} style={lumoStyles.thumbnail} contentFit="cover" />
                ) : (
                  <View style={lumoStyles.thumbnailFallback}>
                    <Ionicons name={post.media_type === 'video' ? 'play' : 'image-outline'} size={17} color={colors.muted} />
                  </View>
                )}
                <View style={lumoStyles.contentCopy}>
                  <Text style={lumoStyles.contentName} numberOfLines={1}>{post.caption?.trim() || (post.media_type === 'video' ? 'Video post' : 'Photo post')}</Text>
                  <Text style={lumoStyles.contentMeta}>{post.media_type === 'video' ? 'VIDEO' : 'POST'} · {new Date(post.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={lumoStyles.contentNumber}>{formatStudioNumber(post.opens)}</Text>
                <Text style={lumoStyles.contentNumber}>{formatStudioNumber(post.likes)}</Text>
                <Text style={lumoStyles.contentNumber}>{formatStudioNumber(post.comments)}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.dim} />
              </Pressable>
            ))}
            <Text style={lumoStyles.tableFootnote}>Views include Home-feed photo impressions (55% visible for 250 ms), photo post opens and video playback sessions.</Text>
          </StudioPanel>
        </View>

        <View style={[lumoStyles.sideColumn, isWide && lumoStyles.sideColumnWide]}>
          <StudioPanel style={lumoStyles.audiencePanel}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="people-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={lumoStyles.panelTitle}>Audience pulse</Text>
                  <Text style={lumoStyles.panelMeta}>Recent follower activity</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/audience')} hitSlop={8}>
                <Ionicons name="arrow-forward" size={16} color={colors.accentStrong} />
              </Pressable>
            </View>
            <View style={lumoStyles.audienceSummary}>
              <Text style={lumoStyles.audienceValue}>+{formatStudioNumber(newFollowers)}</Text>
              <Text style={lumoStyles.audienceCaption}>new followers · {period.toUpperCase()}</Text>
            </View>
            {recentFollowers.length ? recentFollowers.slice(0, 4).map((row, index) => (
              <Pressable key={row.person?.id ?? row.created_at + index} onPress={() => row.person?.id && router.push('/user/' + row.person.id)} style={lumoStyles.personRow}>
                {row.person?.avatar_url ? (
                  <Image source={{ uri: row.person.avatar_url }} style={lumoStyles.personAvatar} contentFit="cover" />
                ) : (
                  <View style={lumoStyles.personAvatarFallback}><Ionicons name="person" size={15} color={colors.muted} /></View>
                )}
                <View style={lumoStyles.personCopy}>
                  <Text style={lumoStyles.personName} numberOfLines={1}>{row.person?.full_name || row.person?.username || 'Lumo member'}</Text>
                  <Text style={lumoStyles.personHandle}>@{row.person?.username ?? 'member'}</Text>
                </View>
                <Text style={lumoStyles.personTime}>{new Date(row.created_at).toLocaleDateString()}</Text>
              </Pressable>
            )) : (
              <Text style={lumoStyles.sideEmpty}>New followers will appear here.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/audience')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>View audience</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>

          <StudioPanel style={lumoStyles.activityPanel}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="flash-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={lumoStyles.panelTitle}>Recent activity</Text>
                  <Text style={lumoStyles.panelMeta}>Around your content</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/community')} hitSlop={8}>
                <Ionicons name="arrow-forward" size={16} color={colors.accentStrong} />
              </Pressable>
            </View>
            {recentComments.length ? recentComments.slice(0, 4).map((comment) => (
              <Pressable key={comment.id} onPress={() => router.push('/post/' + comment.post_id)} style={lumoStyles.activityRow}>
                <View style={lumoStyles.activityIcon}><Ionicons name="chatbubble-outline" size={15} color={colors.accentStrong} /></View>
                <View style={lumoStyles.activityCopy}>
                  <Text style={lumoStyles.activityName}>@{comment.person?.username ?? 'user'}</Text>
                  <Text style={lumoStyles.activityBody} numberOfLines={2}>{comment.body?.trim() || 'Media comment'}</Text>
                </View>
              </Pressable>
            )) : (
              <Text style={lumoStyles.sideEmpty}>Comments on your posts will appear here.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/community')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>Open community</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>

          <StudioPanel style={lumoStyles.plannerPanel}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="calendar-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={lumoStyles.panelTitle}>Publishing queue</Text>
                  <Text style={lumoStyles.panelMeta}>Your next plans</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/planner')} hitSlop={8}>
                <Ionicons name="arrow-forward" size={16} color={colors.accentStrong} />
              </Pressable>
            </View>
            {upcomingPlans.length ? upcomingPlans.map((plan) => (
              <View key={plan.id} style={lumoStyles.planRow}>
                <View style={lumoStyles.planDateBox}>
                  <Text style={lumoStyles.planDay}>{plan.scheduled_at ? new Date(plan.scheduled_at).getDate() : '—'}</Text>
                  <Text style={lumoStyles.planMonth}>{plan.scheduled_at ? new Date(plan.scheduled_at).toLocaleDateString(undefined, { month: 'short' }).toUpperCase() : 'DATE'}</Text>
                </View>
                <View style={lumoStyles.planCopy}>
                  <Text style={lumoStyles.planName} numberOfLines={1}>{plan.title}</Text>
                  <Text style={lumoStyles.planMeta}>PLANNED</Text>
                </View>
              </View>
            )) : (
              <Text style={lumoStyles.sideEmpty}>No upcoming plans.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/planner')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>Open planner</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>
        </View>
      </View>

      <View style={lumoStyles.quickActions}>
        <Pressable onPress={() => router.push('/create')} style={lumoStyles.quickActionPrimary}>
          <Ionicons name="add" size={17} color={colors.bg} />
          <Text style={lumoStyles.quickActionPrimaryText}>Create content</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/creator-studio/planner')} style={lumoStyles.quickAction}>
          <Ionicons name="calendar-outline" size={16} color={colors.accentStrong} />
          <Text style={lumoStyles.quickActionText}>Plan content</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/messages')} style={lumoStyles.quickAction}>
          <Ionicons name="mail-outline" size={16} color={colors.accentStrong} />
          <Text style={lumoStyles.quickActionText}>Open inbox</Text>
        </Pressable>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  commandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  commandLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  liveMark: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  commandTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  accountTypePill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  accountTypeText: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  commandActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  periodControl: { flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: colors.surface },
  periodButton: { minWidth: 38, height: 29, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 8 },
  periodButtonActive: { backgroundColor: colors.accent },
  periodText: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  periodTextActive: { color: colors.bg },
  refreshButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  errorPanel: { flexDirection: 'row', alignItems: 'center', gap: 9, borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 10, flex: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: 190, minWidth: 155, minHeight: 122, padding: 14, justifyContent: 'space-between', gap: 12 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  metricHint: { flex: 1, color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  metricValue: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  metricBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  metricDelta: { color: colors.success, fontSize: 9, fontWeight: '800' },
  metricSub: { color: colors.dim, fontSize: 9 },
  mainGrid: { gap: 12 },
  mainGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { gap: 12 },
  primaryColumnWide: { flex: 1.9, minWidth: 0 },
  sideColumn: { gap: 12 },
  sideColumnWide: { flex: 1, minWidth: 275 },
  chartPanel: { gap: 14, padding: 16 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  panelIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  panelHeading: { flex: 1, minWidth: 0, gap: 3 },
  panelTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  panelMeta: { color: colors.dim, fontSize: 9 },
  viewAllButton: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  viewAllText: { color: colors.accentStrong, fontSize: 9, fontWeight: '800' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendOpen: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentStrong },
  legendFollower: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#64717D' },
  legendText: { color: colors.muted, fontSize: 9 },
  chartArea: { height: 176, position: 'relative', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border },
  chartGuides: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', paddingVertical: 5 },
  chartGuide: { height: 1, backgroundColor: 'rgba(148, 163, 184, 0.10)', borderStyle: 'dashed', borderWidth: 0.5, borderColor: 'rgba(148, 163, 184, 0.08)' },
  chartBars: { height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 2 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBarGroup: { width: '100%', height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chartBarOpen: { flex: 1, minHeight: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.accentStrong, opacity: 0.88 },
  chartBarFollower: { flex: 1, minHeight: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#64717D', opacity: 0.9 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.dim, fontSize: 8 },
  chartLoading: { height: 176, alignItems: 'center', justifyContent: 'center' },
  chartEmpty: { paddingTop: 5 },
  chartEmptyText: { color: colors.dim, fontSize: 9, lineHeight: 14 },
  contentPanel: { gap: 12, paddingHorizontal: 13, paddingVertical: 15 },
  tableHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeading: { width: 57, textAlign: 'right', color: colors.dim, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },
  postHeading: { flex: 1, width: undefined, textAlign: 'left' },
  contentRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 13, color: colors.dim, fontSize: 9, fontWeight: '800' },
  thumbnail: { width: 42, height: 48, borderRadius: 9, backgroundColor: colors.surfaceRaised },
  thumbnailFallback: { width: 42, height: 48, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  contentCopy: { flex: 1, minWidth: 50, gap: 4 },
  contentName: { color: colors.text, fontSize: 9, fontWeight: '800' },
  contentMeta: { color: colors.dim, fontSize: 7, fontWeight: '800', letterSpacing: 0.4 },
  contentNumber: { width: 57, textAlign: 'right', color: colors.text, fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tableFootnote: { color: colors.dim, fontSize: 8, lineHeight: 12, paddingTop: 2 },
  tableEmpty: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tableEmptyText: { color: colors.muted, fontSize: 10 },
  createInline: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.accent },
  createInlineText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
  audiencePanel: { gap: 12, padding: 15 },
  audienceSummary: { paddingVertical: 12, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 3 },
  audienceValue: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  audienceCaption: { color: colors.muted, fontSize: 9 },
  personRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  personAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  personAvatarFallback: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  personCopy: { flex: 1, minWidth: 0, gap: 3 },
  personName: { color: colors.text, fontSize: 9, fontWeight: '800' },
  personHandle: { color: colors.dim, fontSize: 8 },
  personTime: { color: colors.dim, fontSize: 7 },
  sideEmpty: { color: colors.dim, fontSize: 9, lineHeight: 14, paddingVertical: 8 },
  panelFooterButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 5 },
  panelFooterText: { color: colors.accentStrong, fontSize: 9, fontWeight: '800' },
  activityPanel: { gap: 10, padding: 15 },
  activityRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  activityIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  activityCopy: { flex: 1, minWidth: 0, gap: 3 },
  activityName: { color: colors.text, fontSize: 9, fontWeight: '800' },
  activityBody: { color: colors.muted, fontSize: 8, lineHeight: 12 },
  plannerPanel: { gap: 10, padding: 15 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  planDateBox: { width: 39, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  planDay: { color: colors.text, fontSize: 14, fontWeight: '900' },
  planMonth: { color: colors.muted, fontSize: 7, fontWeight: '900' },
  planCopy: { flex: 1, gap: 4 },
  planName: { color: colors.text, fontSize: 9, fontWeight: '800' },
  planMeta: { color: colors.dim, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  quickActionPrimary: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.accent },
  quickActionPrimaryText: { color: colors.bg, fontSize: 10, fontWeight: '900' },
  quickAction: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quickActionText: { color: colors.text, fontSize: 10, fontWeight: '800' },
});
