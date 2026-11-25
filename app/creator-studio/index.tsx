import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { formatStudioNumber, getPeriodStart, loadCreatorContentEvents, loadCreatorFollowerDates, loadStudioOverview, type StudioOverview } from '../../lib/studio-data';
import { colors } from '../../lib/theme';
import { getStudioBodyWidth } from '../../lib/responsive';
import { useStudioStyles } from "../../lib/theme-styles";

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
  const lumoStyles = useStudioStyles(styles);
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
      loadCreatorContentEvents(userId, since),
      loadCreatorFollowerDates(userId, since),
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
      recentFollowerResult, commentsResult, plansResult,
      likeResult, commentCountResult, postsPeriodResult, storiesPeriodResult, postsResult,
    ];
    for (const result of results) {
      if (result.error) throw result.error;
    }

    const loadedEvents = eventResult as EventRow[];
    const loadedFollowers = followerResult;
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
    setEventTotal(loadedEvents.length);
    setNewFollowers(loadedFollowers.length);
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
  const isMobile = contentWidth < 640;
  const isNarrowMobile = contentWidth < 360;
  const accountLabel = overview.accountType === 'business' ? 'BUSINESS' : overview.accountType === 'creator' ? 'CREATOR' : 'PERSONAL';
  const firstDay = startOfPeriod(period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <StudioFrame title="Dashboard" subtitle={accountLabel + ' workspace'} icon="grid-outline" wide>
      <View style={[lumoStyles.commandRow, isMobile && lumoStyles.commandRowMobile]}>
        <View style={[lumoStyles.commandLeft, isMobile && lumoStyles.commandLeftMobile]}>
          <View style={lumoStyles.liveMark} />
          <Text style={[lumoStyles.commandTitle, isMobile && lumoStyles.commandTitleMobile]}>Performance overview</Text>
          <View style={lumoStyles.accountTypePill}>
            <Text style={lumoStyles.accountTypeText}>{accountLabel}</Text>
          </View>
        </View>
        <View style={[lumoStyles.commandActions, isMobile && lumoStyles.commandActionsMobile]}>
          <View style={[lumoStyles.periodControl, isMobile && lumoStyles.periodControlMobile]}>
            {periodOptions.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setPeriod(item.key)}
                style={[lumoStyles.periodButton, isMobile && lumoStyles.periodButtonMobile, period === item.key && lumoStyles.periodButtonActive]}
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

      <View style={[lumoStyles.metricGrid, isMobile && lumoStyles.metricGridMobile]}>
        <StudioPanel style={[lumoStyles.metricCard, isMobile && lumoStyles.metricCardMobile, isNarrowMobile && lumoStyles.metricCardNarrowMobile]}>
          <View style={[lumoStyles.metricTop, isMobile && lumoStyles.metricTopMobile]}>
            <View style={lumoStyles.metricIcon}><Ionicons name="people-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={[lumoStyles.metricHint, isMobile && lumoStyles.metricHintMobile]}>AUDIENCE</Text>
            <Ionicons name="trending-up-outline" size={16} color={colors.success} />
          </View>
          <Text style={[lumoStyles.metricValue, isMobile && lumoStyles.metricValueMobile]}>{formatStudioNumber(overview.followers)}</Text>
          <View style={[lumoStyles.metricBottom, isMobile && lumoStyles.metricBottomMobile]}>
            <Text style={[lumoStyles.metricLabel, isMobile && lumoStyles.metricLabelMobile]}>Followers</Text>
            <Text style={[lumoStyles.metricDelta, isMobile && lumoStyles.metricDeltaMobile]}>+{formatStudioNumber(newFollowers)} in range</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={[lumoStyles.metricCard, isMobile && lumoStyles.metricCardMobile, isNarrowMobile && lumoStyles.metricCardNarrowMobile]}>
          <View style={[lumoStyles.metricTop, isMobile && lumoStyles.metricTopMobile]}>
            <View style={lumoStyles.metricIcon}><Ionicons name="eye-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={[lumoStyles.metricHint, isMobile && lumoStyles.metricHintMobile]}>DISCOVERY</Text>
            <Ionicons name="pulse-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={[lumoStyles.metricValue, isMobile && lumoStyles.metricValueMobile]}>{formatStudioNumber(eventTotal)}</Text>
          <View style={[lumoStyles.metricBottom, isMobile && lumoStyles.metricBottomMobile]}>
            <Text style={[lumoStyles.metricLabel, isMobile && lumoStyles.metricLabelMobile]}>Views</Text>
            <Text style={[lumoStyles.metricSub, isMobile && lumoStyles.metricSubMobile]}>{formatStudioNumber(uniqueViewers)} unique viewers · post, story + video activity</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={[lumoStyles.metricCard, isMobile && lumoStyles.metricCardMobile, isNarrowMobile && lumoStyles.metricCardNarrowMobile]}>
          <View style={[lumoStyles.metricTop, isMobile && lumoStyles.metricTopMobile]}>
            <View style={lumoStyles.metricIcon}><Ionicons name="heart-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={[lumoStyles.metricHint, isMobile && lumoStyles.metricHintMobile]}>INTERACTIONS</Text>
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={[lumoStyles.metricValue, isMobile && lumoStyles.metricValueMobile]}>{formatStudioNumber(interactions)}</Text>
          <View style={[lumoStyles.metricBottom, isMobile && lumoStyles.metricBottomMobile]}>
            <Text style={[lumoStyles.metricLabel, isMobile && lumoStyles.metricLabelMobile]}>Likes + comments</Text>
            <Text style={[lumoStyles.metricSub, isMobile && lumoStyles.metricSubMobile]}>{formatStudioNumber(periodLikes)} likes · {formatStudioNumber(periodComments)} comments</Text>
          </View>
        </StudioPanel>
        <StudioPanel style={[lumoStyles.metricCard, isMobile && lumoStyles.metricCardMobile, isNarrowMobile && lumoStyles.metricCardNarrowMobile]}>
          <View style={[lumoStyles.metricTop, isMobile && lumoStyles.metricTopMobile]}>
            <View style={lumoStyles.metricIcon}><Ionicons name="images-outline" size={18} color={colors.accentStrong} /></View>
            <Text style={[lumoStyles.metricHint, isMobile && lumoStyles.metricHintMobile]}>PUBLISHING</Text>
            <Ionicons name="albums-outline" size={16} color={colors.accentStrong} />
          </View>
          <Text style={[lumoStyles.metricValue, isMobile && lumoStyles.metricValueMobile]}>{formatStudioNumber(overview.posts)}</Text>
          <View style={[lumoStyles.metricBottom, isMobile && lumoStyles.metricBottomMobile]}>
            <Text style={[lumoStyles.metricLabel, isMobile && lumoStyles.metricLabelMobile]}>Published posts</Text>
            <Text style={[lumoStyles.metricSub, isMobile && lumoStyles.metricSubMobile]}>{formatStudioNumber(publishedInPeriod)} posts & stories in range</Text>
          </View>
        </StudioPanel>
      </View>

      <View style={[lumoStyles.mainGrid, isWide && lumoStyles.mainGridWide]}>
        <View style={[lumoStyles.primaryColumn, isWide && lumoStyles.primaryColumnWide]}>
          <StudioPanel style={[lumoStyles.chartPanel, isMobile && lumoStyles.chartPanelMobile]}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="analytics-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={[lumoStyles.panelTitle, isMobile && lumoStyles.panelTitleMobile]}>Account activity</Text>
                  <Text style={[lumoStyles.panelMeta, isMobile && lumoStyles.panelMetaMobile]}>{firstDay} — today</Text>
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
                <View style={[lumoStyles.chartLegend, isMobile && lumoStyles.chartLegendMobile]}>
                  <View style={lumoStyles.legendItem}><View style={lumoStyles.legendOpen} /><Text style={lumoStyles.legendText}>Content opens</Text></View>
                  <View style={lumoStyles.legendItem}><View style={lumoStyles.legendFollower} /><Text style={lumoStyles.legendText}>New followers</Text></View>
                </View>
                <View style={[lumoStyles.chartArea, isMobile && lumoStyles.chartAreaMobile]}>
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
                          <View style={[lumoStyles.chartBarOpen, { height: Math.max(3, (bucket.opens / chartMax) * (isMobile ? 140 : 168)) }]} />
                          <View style={[lumoStyles.chartBarFollower, { height: Math.max(3, (bucket.followers / chartMax) * (isMobile ? 140 : 168)) }]} />
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

          <StudioPanel style={[lumoStyles.contentPanel, isMobile && lumoStyles.contentPanelMobile]}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="trophy-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={[lumoStyles.panelTitle, isMobile && lumoStyles.panelTitleMobile]}>Top content</Text>
                  <Text style={[lumoStyles.panelMeta, isMobile && lumoStyles.panelMetaMobile]}>{eventTotal > 0 ? 'Ranked by recorded views' : 'Recent posts · early activity data'}</Text>
                </View>
              </View>
              <Pressable onPress={() => router.push('/creator-studio/content')} style={lumoStyles.viewAllButton} accessibilityRole="button">
                <Text style={lumoStyles.viewAllText}>Library</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.accentStrong} />
              </Pressable>
            </View>
            <View style={[lumoStyles.tableHeader, isMobile && lumoStyles.tableHeaderMobile]}>
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
              <Pressable
                key={post.id}
                onPress={() => router.push((post.media_type === 'video' || post.video_url ? '/creator-studio/video/' : '/post/') + post.id)}
                style={[lumoStyles.contentRow, isMobile && lumoStyles.contentRowMobile]}
                accessibilityRole="button"
              >
                {isMobile ? (
                  <>
                    <View style={lumoStyles.mobilePostHeader}>
                      <Text style={lumoStyles.rank}>{index + 1}</Text>
                      {post.image_url ? (
                        <Image source={{ uri: post.image_url }} style={lumoStyles.thumbnailMobile} contentFit="cover" />
                      ) : (
                        <View style={[lumoStyles.thumbnailFallback, lumoStyles.thumbnailMobile]}>
                          <Ionicons name={post.media_type === 'video' ? 'play' : 'image-outline'} size={18} color={colors.muted} />
                        </View>
                      )}
                      <View style={lumoStyles.contentCopy}>
                        <Text style={lumoStyles.contentNameMobile} numberOfLines={2}>{post.caption?.trim() || (post.media_type === 'video' ? 'Video post' : 'Photo post')}</Text>
                        <Text style={lumoStyles.contentMetaMobile}>{post.media_type === 'video' ? 'VIDEO' : 'POST'} · {new Date(post.created_at).toLocaleDateString()}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.dim} />
                    </View>
                    <View style={lumoStyles.mobilePostStats}>
                      <View style={lumoStyles.mobilePostStat}>
                        <Text style={lumoStyles.mobilePostStatValue}>{formatStudioNumber(post.opens)}</Text>
                        <Text style={lumoStyles.mobilePostStatLabel}>Views</Text>
                      </View>
                      <View style={lumoStyles.mobilePostStat}>
                        <Text style={lumoStyles.mobilePostStatValue}>{formatStudioNumber(post.likes)}</Text>
                        <Text style={lumoStyles.mobilePostStatLabel}>Likes</Text>
                      </View>
                      <View style={lumoStyles.mobilePostStat}>
                        <Text style={lumoStyles.mobilePostStatValue}>{formatStudioNumber(post.comments)}</Text>
                        <Text style={lumoStyles.mobilePostStatLabel}>Comments</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </Pressable>
            ))}
            <Text style={lumoStyles.tableFootnote}>Views include Home-feed photo impressions (55% visible for 250 ms), photo post opens and video playback sessions.</Text>
          </StudioPanel>
        </View>

        <View style={[lumoStyles.sideColumn, isWide && lumoStyles.sideColumnWide]}>
          <StudioPanel style={[lumoStyles.audiencePanel, isMobile && lumoStyles.sidePanelMobile]}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="people-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={[lumoStyles.panelTitle, isMobile && lumoStyles.panelTitleMobile]}>Audience pulse</Text>
                  <Text style={[lumoStyles.panelMeta, isMobile && lumoStyles.panelMetaMobile]}>Recent follower activity</Text>
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
                  <Text style={[lumoStyles.personName, isMobile && lumoStyles.sideNameMobile]} numberOfLines={1}>{row.person?.full_name || row.person?.username || 'Lumo member'}</Text>
                  <Text style={[lumoStyles.personHandle, isMobile && lumoStyles.sideMetaMobile]}>@{row.person?.username ?? 'member'}</Text>
                </View>
                <Text style={[lumoStyles.personTime, isMobile && lumoStyles.sideMetaMobile]}>{new Date(row.created_at).toLocaleDateString()}</Text>
              </Pressable>
            )) : (
              <Text style={[lumoStyles.sideEmpty, isMobile && lumoStyles.sideMetaMobile]}>New followers will appear here.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/audience')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>View audience</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>

          <StudioPanel style={[lumoStyles.activityPanel, isMobile && lumoStyles.sidePanelMobile]}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="flash-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={[lumoStyles.panelTitle, isMobile && lumoStyles.panelTitleMobile]}>Recent activity</Text>
                  <Text style={[lumoStyles.panelMeta, isMobile && lumoStyles.panelMetaMobile]}>Around your content</Text>
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
                  <Text style={[lumoStyles.activityName, isMobile && lumoStyles.sideNameMobile]}>@{comment.person?.username ?? 'user'}</Text>
                  <Text style={[lumoStyles.activityBody, isMobile && lumoStyles.sideMetaMobile]} numberOfLines={2}>{comment.body?.trim() || 'Media comment'}</Text>
                </View>
              </Pressable>
            )) : (
              <Text style={[lumoStyles.sideEmpty, isMobile && lumoStyles.sideMetaMobile]}>Comments on your posts will appear here.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/community')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>Open community</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>

          <StudioPanel style={[lumoStyles.plannerPanel, isMobile && lumoStyles.sidePanelMobile]}>
            <View style={lumoStyles.panelHeader}>
              <View style={lumoStyles.panelTitleRow}>
                <View style={lumoStyles.panelIcon}><Ionicons name="calendar-outline" size={18} color={colors.accentStrong} /></View>
                <View style={lumoStyles.panelHeading}>
                  <Text style={[lumoStyles.panelTitle, isMobile && lumoStyles.panelTitleMobile]}>Publishing queue</Text>
                  <Text style={[lumoStyles.panelMeta, isMobile && lumoStyles.panelMetaMobile]}>Your next plans</Text>
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
                  <Text style={[lumoStyles.planName, isMobile && lumoStyles.sideNameMobile]} numberOfLines={1}>{plan.title}</Text>
                  <Text style={[lumoStyles.planMeta, isMobile && lumoStyles.sideMetaMobile]}>PLANNED</Text>
                </View>
              </View>
            )) : (
              <Text style={[lumoStyles.sideEmpty, isMobile && lumoStyles.sideMetaMobile]}>No upcoming plans.</Text>
            )}
            <Pressable onPress={() => router.push('/creator-studio/planner')} style={lumoStyles.panelFooterButton}>
              <Text style={lumoStyles.panelFooterText}>Open planner</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>
        </View>
      </View>

      <View style={[lumoStyles.quickActions, isMobile && lumoStyles.quickActionsMobile]}>
        <Pressable onPress={() => router.push('/create')} style={[lumoStyles.quickActionPrimary, isMobile && lumoStyles.quickActionMobile]}>
          <Ionicons name="add" size={17} color={colors.bg} />
          <Text style={lumoStyles.quickActionPrimaryText}>Create content</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/creator-studio/planner')} style={[lumoStyles.quickAction, isMobile && lumoStyles.quickActionMobile]}>
          <Ionicons name="calendar-outline" size={16} color={colors.accentStrong} />
          <Text style={lumoStyles.quickActionText}>Plan content</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/messages')} style={[lumoStyles.quickAction, isMobile && lumoStyles.quickActionMobile]}>
          <Ionicons name="mail-outline" size={16} color={colors.accentStrong} />
          <Text style={lumoStyles.quickActionText}>Open inbox</Text>
        </Pressable>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  commandRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  commandLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, minWidth: 0 },
  liveMark: { width: 8, height: 8, borderRadius: 5, backgroundColor: colors.success },
  commandTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  accountTypePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  accountTypeText: { color: colors.muted, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  commandActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  periodControl: { flexDirection: 'row', padding: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.surface },
  periodButton: { minWidth: 46, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10 },
  periodButtonActive: { backgroundColor: colors.accent },
  periodText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  periodTextActive: { color: colors.bg },
  refreshButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  errorPanel: { flexDirection: 'row', alignItems: 'center', gap: 9, borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 11, flex: 1 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: { flexGrow: 1, flexBasis: 210, minWidth: 176, minHeight: 158, padding: 19, justifyContent: 'space-between', gap: 14, borderRadius: 21 },
  metricTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  metricHint: { flex: 1, color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  metricValue: { color: colors.text, fontSize: 33, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  metricBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 7 },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  metricDelta: { color: colors.success, fontSize: 11, fontWeight: '800' },
  metricSub: { color: colors.dim, fontSize: 11, lineHeight: 15 },
  mainGrid: { gap: 18 },
  mainGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  primaryColumn: { gap: 18, minWidth: 0 },
  primaryColumnWide: { flex: 1.9, minWidth: 0 },
  sideColumn: { gap: 18, minWidth: 0 },
  sideColumnWide: { flex: 1, minWidth: 290 },
  chartPanel: { gap: 18, padding: 22, borderRadius: 22 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 },
  panelIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  panelHeading: { flex: 1, minWidth: 0, gap: 3 },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  panelMeta: { color: colors.dim, fontSize: 11, lineHeight: 15 },
  viewAllButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 11, backgroundColor: colors.surfaceRaised },
  viewAllText: { color: colors.accentStrong, fontSize: 11, fontWeight: '800' },
  chartLegend: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendOpen: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentStrong },
  legendFollower: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#64717D' },
  legendText: { color: colors.muted, fontSize: 10.5 },
  chartArea: { height: 214, position: 'relative', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: colors.border },
  chartGuides: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', paddingVertical: 5 },
  chartGuide: { height: 1, backgroundColor: 'rgba(148, 163, 184, 0.10)', borderStyle: 'dashed', borderWidth: 0.5, borderColor: 'rgba(148, 163, 184, 0.08)' },
  chartBars: { height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingHorizontal: 3 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBarGroup: { width: '100%', height: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chartBarOpen: { flex: 1, minHeight: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.accentStrong, opacity: 0.88 },
  chartBarFollower: { flex: 1, minHeight: 3, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: '#64717D', opacity: 0.9 },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.dim, fontSize: 10.5 },
  chartLoading: { height: 214, alignItems: 'center', justifyContent: 'center' },
  chartEmpty: { paddingTop: 5 },
  chartEmptyText: { color: colors.dim, fontSize: 10.5, lineHeight: 14 },
  contentPanel: { gap: 15, paddingHorizontal: 19, paddingVertical: 20, borderRadius: 22 },
  tableHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeading: { width: 70, textAlign: 'right', color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.35 },
  postHeading: { flex: 1, width: undefined, textAlign: 'left' },
  contentRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 13, color: colors.dim, fontSize: 10.5, fontWeight: '800' },
  thumbnail: { width: 52, height: 58, borderRadius: 11, backgroundColor: colors.surfaceRaised },
  thumbnailFallback: { width: 42, height: 48, borderRadius: 9, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  contentCopy: { flex: 1, minWidth: 70, gap: 5 },
  contentName: { color: colors.text, fontSize: 11, fontWeight: '800' },
  contentMeta: { color: colors.dim, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  contentNumber: { width: 70, textAlign: 'right', color: colors.text, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tableFootnote: { color: colors.dim, fontSize: 10.5, lineHeight: 12, paddingTop: 2 },
  tableEmpty: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 8 },
  tableEmptyText: { color: colors.muted, fontSize: 11 },
  createInline: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.accent },
  createInlineText: { color: colors.bg, fontSize: 10.5, fontWeight: '900' },
  audiencePanel: { gap: 14, padding: 18, borderRadius: 20 },
  audienceSummary: { paddingVertical: 12, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 3 },
  audienceValue: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.7 },
  audienceCaption: { color: colors.muted, fontSize: 10.5 },
  personRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  personAvatar: { width: 36, height: 36, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  personAvatarFallback: { width: 36, height: 36, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  personCopy: { flex: 1, minWidth: 0, gap: 3 },
  personName: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  personHandle: { color: colors.dim, fontSize: 10.5 },
  personTime: { color: colors.dim, fontSize: 10.5 },
  sideEmpty: { color: colors.dim, fontSize: 10.5, lineHeight: 14, paddingVertical: 8 },
  panelFooterButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 5 },
  panelFooterText: { color: colors.accentStrong, fontSize: 10.5, fontWeight: '800' },
  activityPanel: { gap: 13, padding: 18, borderRadius: 20 },
  activityRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  activityIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  activityCopy: { flex: 1, minWidth: 0, gap: 3 },
  activityName: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  activityBody: { color: colors.muted, fontSize: 10.5, lineHeight: 12 },
  plannerPanel: { gap: 13, padding: 18, borderRadius: 20 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  planDateBox: { width: 44, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  planDay: { color: colors.text, fontSize: 14, fontWeight: '900' },
  planMonth: { color: colors.muted, fontSize: 10.5, fontWeight: '900' },
  planCopy: { flex: 1, gap: 4 },
  planName: { color: colors.text, fontSize: 10.5, fontWeight: '800' },
  planMeta: { color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.6 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  quickActionPrimary: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.accent },
  quickActionPrimaryText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  quickAction: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quickActionText: { color: colors.text, fontSize: 11, fontWeight: '800' },

  commandRowMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  commandLeftMobile: { width: '100%', flexWrap: 'wrap', gap: 8 },
  commandTitleMobile: { fontSize: 14, flexShrink: 1 },
  commandActionsMobile: { width: '100%', justifyContent: 'space-between' },
  periodControlMobile: { flex: 1, justifyContent: 'space-between' },
  periodButtonMobile: { flex: 1, minWidth: 0 },
  metricGridMobile: { gap: 8 },
  metricCardMobile: { flexBasis: '47%', flexGrow: 1, minWidth: 0, minHeight: 148, padding: 14, gap: 10, borderRadius: 18 },
  metricCardNarrowMobile: { flexBasis: '100%' },
  metricTopMobile: { gap: 5 },
  metricHintMobile: { fontSize: 10, letterSpacing: 0.45 },
  metricValueMobile: { fontSize: 25, letterSpacing: -0.6 },
  metricBottomMobile: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', flexWrap: 'nowrap', gap: 3 },
  metricLabelMobile: { fontSize: 11 },
  metricDeltaMobile: { fontSize: 11 },
  metricSubMobile: { fontSize: 10.5, lineHeight: 13 },
  chartPanelMobile: { padding: 16, gap: 14 },
  chartLegendMobile: { flexWrap: 'wrap', gap: 10 },
  chartAreaMobile: { height: 168 },
  tableHeaderMobile: { display: 'none' },
  contentPanelMobile: { paddingHorizontal: 15, paddingVertical: 16, gap: 12 },
  contentRowMobile: { minHeight: 126, flexDirection: 'column', alignItems: 'stretch', gap: 12, paddingVertical: 14 },
  mobilePostHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  thumbnailMobile: { width: 48, height: 52, borderRadius: 10 },
  contentNameMobile: { color: colors.text, fontSize: 12, fontWeight: '800', lineHeight: 16 },
  contentMetaMobile: { color: colors.dim, fontSize: 10.5, fontWeight: '700', marginTop: 4 },
  mobilePostStats: { width: '100%', flexDirection: 'row', gap: 8 },
  mobilePostStat: { flex: 1, minWidth: 0, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  mobilePostStatValue: { color: colors.text, fontSize: 14, fontWeight: '900' },
  mobilePostStatLabel: { color: colors.muted, fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  sidePanelMobile: { padding: 16, gap: 14 },
  quickActionsMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  quickActionMobile: { width: '100%', minHeight: 48, justifyContent: 'center' },
  panelTitleMobile: { fontSize: 14 },
  panelMetaMobile: { fontSize: 11, lineHeight: 14 },
  sideNameMobile: { fontSize: 12, lineHeight: 16 },
  sideMetaMobile: { fontSize: 11, lineHeight: 15 },
});
