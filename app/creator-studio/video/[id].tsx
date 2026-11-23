import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioSection } from '../../../components/studio/StudioWidgets';
import LumoVideoPlayer from '../../../components/LumoVideoPlayer';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { useThemedStyles } from "../../../lib/theme-styles";

type Period = '7d' | '30d' | '90d' | 'all';
type VideoPost = { id: string; user_id: string; caption: string | null; media_type: string; video_url: string | null; image_url: string | null; created_at: string };
type PlaybackEvent = { viewer_id: string; watch_ms: number; content_duration_ms: number; event_type: string; occurred_at: string };
type CommentRow = { id: string; body: string | null; created_at: string; person: { username: string | null; avatar_url: string | null } | null };

const periods: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'all', label: 'ALL' },
];

function describeError(reason: unknown) {
  if (reason && typeof reason === 'object') {
    const value = reason as Record<string, unknown>;
    const parts = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === 'string' && !!part.trim());
    if (parts.length) return parts.join(' · ');
  }
  return reason instanceof Error ? reason.message : String(reason || 'Unknown error');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  if (minutes > 0) return minutes + 'm ' + seconds + 's';
  return seconds + 's';
}

function getSince(period: Period) {
  if (period === 'all') return null;
  const date = new Date();
  date.setDate(date.getDate() - (period === '7d' ? 7 : period === '30d' ? 30 : 90));
  return date.toISOString();
}

export default function StudioVideoAnalyticsScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('30d');
  const [post, setPost] = useState<VideoPost | null>(null);
  const [events, setEvents] = useState<PlaybackEvent[]>([]);
  const [viewCount, setViewCount] = useState(0);
  const [likes, setLikes] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId || !id) return;
    const since = getSince(period);
    const eventsQuery = supabase.from('creator_content_events')
      .select('viewer_id, watch_ms, content_duration_ms, event_type, occurred_at', { count: 'exact' })
      .eq('owner_id', userId)
      .eq('content_type', 'post')
      .eq('content_id', id)
      .order('occurred_at', { ascending: false })
      .limit(5000);
    const likesQuery = supabase.from('likes')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', id);
    const commentsQuery = supabase.from('comments')
      .select('id, body, created_at, person:profiles!comments_user_id_fkey(username, avatar_url)', { count: 'exact' })
      .eq('post_id', id)
      .order('created_at', { ascending: false })
      .limit(6);
    if (since) eventsQuery.gte('occurred_at', since);
    const [postResult, eventsResult, likesResult, commentsResult] = await Promise.all([
      supabase.from('posts')
        .select('id, user_id, caption, media_type, video_url, image_url, created_at')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle(),
      eventsQuery,
      likesQuery,
      commentsQuery,
    ]);
    if (postResult.error) throw new Error('posts: ' + describeError(postResult.error));
    if (eventsResult.error) throw new Error('creator_content_events: ' + describeError(eventsResult.error));
    if (likesResult.error) throw new Error('likes: ' + describeError(likesResult.error));
    if (commentsResult.error) throw new Error('comments: ' + describeError(commentsResult.error));
    if (!postResult.data) throw new Error('Video not found in this account.');
    const loadedPost = postResult.data as VideoPost;
    if (loadedPost.media_type !== 'video' && !loadedPost.video_url) throw new Error('This content is not a video.');
    setPost(loadedPost);
    setEvents((eventsResult.data ?? []) as PlaybackEvent[]);
    setViewCount(eventsResult.count ?? 0);
    setLikes(likesResult.count ?? 0);
    setCommentCount(commentsResult.count ?? 0);
    setComments((commentsResult.data ?? []) as unknown as CommentRow[]);
    setError('');
  }, [userId, id, period]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError('Video analytics could not be loaded: ' + describeError(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]));

  const metrics = useMemo(() => {
    const uniqueViewers = new Set(events.map((event) => event.viewer_id)).size;
    const totalWatchMs = events.reduce((sum, event) => sum + Math.max(0, event.watch_ms || 0), 0);
    const viewsWithPlayback = events.filter((event) => event.watch_ms > 0).length;
    const avgWatchMs = viewsWithPlayback ? totalWatchMs / viewsWithPlayback : 0;
    const completed = events.filter((event) => event.event_type === 'complete').length;
    const completionRate = viewCount ? (completed / viewCount) * 100 : 0;
    const retentionEvents = events.filter((event) => event.content_duration_ms > 0);
    const avgRetention = retentionEvents.length
      ? retentionEvents.reduce((sum, event) => sum + Math.min(100, (event.watch_ms / event.content_duration_ms) * 100), 0) / retentionEvents.length
      : null;
    return { uniqueViewers, totalWatchMs, avgWatchMs, completed, completionRate, avgRetention };
  }, [events, viewCount]);

  const chart = useMemo(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 30;
    const count = period === '7d' ? 7 : period === '30d' ? 15 : period === '90d' ? 18 : 15;
    const bucketDays = Math.ceil(days / count);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const buckets = Array.from({ length: count }, () => 0);
    events.forEach((event) => {
      const date = new Date(event.occurred_at);
      date.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((date.getTime() - start.getTime()) / 86400000);
      const index = Math.floor(dayIndex / bucketDays);
      if (index >= 0 && index < buckets.length) buckets[index] += 1;
    });
    return buckets;
  }, [events, period]);
  const maxBar = Math.max(1, ...chart);

  return (
    <StudioFrame title="Video analytics" subtitle="Individual content performance" icon="play-circle-outline" wide>
      <View style={lumoStyles.headerRow}>
        <Pressable onPress={() => router.push('/creator-studio/content')} style={lumoStyles.backButton}>
          <Ionicons name="arrow-back" size={16} color={colors.text} />
          <Text style={lumoStyles.backText}>Content library</Text>
        </Pressable>
        <View style={lumoStyles.periods}>
          {periods.map((item) => (
            <Pressable key={item.key} onPress={() => setPeriod(item.key)} style={[lumoStyles.periodButton, period === item.key && lumoStyles.periodButtonActive]}>
              <Text style={[lumoStyles.periodText, period === item.key && lumoStyles.periodTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {error ? <StudioPanel style={lumoStyles.errorPanel}><Text style={lumoStyles.errorText}>{error}</Text></StudioPanel> : null}
      {loading ? <View style={lumoStyles.loading}><ActivityIndicator color={colors.accentStrong} /></View> : null}
      {post ? (
        <>
          <StudioPanel style={lumoStyles.videoPanel}>
            <View style={lumoStyles.videoPreview}>
              {post.video_url ? <LumoVideoPlayer uri={post.video_url} style={lumoStyles.player} bottomInset={8} /> : (
                <View style={lumoStyles.noPreview}><Ionicons name="videocam-off-outline" size={28} color={colors.muted} /><Text style={lumoStyles.noPreviewText}>Video preview unavailable</Text></View>
              )}
            </View>
            <View style={lumoStyles.videoInfo}>
              <View style={lumoStyles.videoTitleRow}>
                <View style={lumoStyles.videoTitleCopy}>
                  <Text style={lumoStyles.videoTitle} numberOfLines={2}>{post.caption?.trim() || 'Video post'}</Text>
                  <Text style={lumoStyles.videoMeta}>PUBLISHED {new Date(post.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={lumoStyles.videoBadge}><Ionicons name="videocam-outline" size={14} color={colors.accentStrong} /><Text style={lumoStyles.videoBadgeText}>VIDEO</Text></View>
              </View>
            </View>
          </StudioPanel>

          <View style={lumoStyles.metricGrid}>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>VIEWS</Text>
              <Text style={lumoStyles.metricValue}>{formatNumber(viewCount)}</Text>
              <Text style={lumoStyles.metricNote}>{formatNumber(metrics.uniqueViewers)} unique viewers</Text>
            </StudioPanel>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>WATCH TIME</Text>
              <Text style={lumoStyles.metricValue}>{formatTime(metrics.totalWatchMs)}</Text>
              <Text style={lumoStyles.metricNote}>Total recorded playback</Text>
            </StudioPanel>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>AVG. VIEW DURATION</Text>
              <Text style={lumoStyles.metricValue}>{formatTime(metrics.avgWatchMs)}</Text>
              <Text style={lumoStyles.metricNote}>Per view with playback</Text>
            </StudioPanel>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>COMPLETION RATE</Text>
              <Text style={lumoStyles.metricValue}>{viewCount ? metrics.completionRate.toFixed(1) + '%' : '—'}</Text>
              <Text style={lumoStyles.metricNote}>{formatNumber(metrics.completed)} completed views</Text>
            </StudioPanel>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>AVG. VIEWED</Text>
              <Text style={lumoStyles.metricValue}>{metrics.avgRetention == null ? '—' : metrics.avgRetention.toFixed(1) + '%'}</Text>
              <Text style={lumoStyles.metricNote}>Only sessions with duration data</Text>
            </StudioPanel>
            <StudioPanel style={lumoStyles.metricCard}>
              <Text style={lumoStyles.metricLabel}>ENGAGEMENT</Text>
              <Text style={lumoStyles.metricValue}>{formatNumber(likes + commentCount)}</Text>
              <Text style={lumoStyles.metricNote}>{formatNumber(likes)} likes · {formatNumber(commentCount)} comments</Text>
            </StudioPanel>
          </View>

          <StudioPanel style={lumoStyles.chartPanel}>
            <View style={lumoStyles.sectionHeader}>
              <StudioSection title="Views over time" />
              <Text style={lumoStyles.sectionTotal}>{formatNumber(viewCount)} views</Text>
            </View>
            <View style={lumoStyles.chartBars}>
              {chart.map((value, index) => (
                <View key={index} style={lumoStyles.chartColumn}>
                  <View style={lumoStyles.chartTrack}>
                    <View style={[lumoStyles.chartFill, { height: Math.max(3, (value / maxBar) * 148) }]} />
                  </View>
                </View>
              ))}
            </View>
            <View style={lumoStyles.chartAxis}>
              <Text style={lumoStyles.axisText}>{period === 'all' ? 'Recent activity' : period.toUpperCase()}</Text>
              <Text style={lumoStyles.axisText}>Latest</Text>
            </View>
            {!viewCount ? <Text style={lumoStyles.emptyNote}>Views will be recorded when another account opens this post or starts playing the video. Your own views are excluded.</Text> : null}
          </StudioPanel>

          <StudioPanel style={lumoStyles.engagementPanel}>
            <StudioSection title="Latest comments" />
            {comments.length ? comments.map((comment) => (
              <Pressable key={comment.id} onPress={() => router.push('/post/' + post.id)} style={lumoStyles.commentRow}>
                {comment.person?.avatar_url ? <Image source={{ uri: comment.person.avatar_url }} style={lumoStyles.avatar} contentFit="cover" /> : <View style={lumoStyles.avatarFallback}><Ionicons name="person" size={15} color={colors.muted} /></View>}
                <View style={lumoStyles.commentCopy}>
                  <Text style={lumoStyles.commentUser}>@{comment.person?.username ?? 'user'}</Text>
                  <Text style={lumoStyles.commentBody} numberOfLines={2}>{comment.body?.trim() || 'Media comment'}</Text>
                </View>
                <Text style={lumoStyles.commentDate}>{new Date(comment.created_at).toLocaleDateString()}</Text>
              </Pressable>
            )) : <Text style={lumoStyles.emptyNote}>No comments on this video yet.</Text>}
          </StudioPanel>
        </>
      ) : null}
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  backButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7 },
  backText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  periods: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  periodButton: { minWidth: 37, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 7, paddingHorizontal: 7 },
  periodButtonActive: { backgroundColor: colors.accent },
  periodText: { color: colors.muted, fontSize: 8, fontWeight: '900' },
  periodTextActive: { color: colors.bg },
  errorPanel: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 10 },
  loading: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  videoPanel: { padding: 0, overflow: 'hidden' },
  videoPreview: { width: '100%', height: 390, backgroundColor: '#050607' },
  player: { width: '100%', height: '100%' },
  noPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noPreviewText: { color: colors.muted, fontSize: 10 },
  videoInfo: { padding: 16 },
  videoTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  videoTitleCopy: { flex: 1, gap: 5 },
  videoTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  videoMeta: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  videoBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  videoBadgeText: { color: colors.accentStrong, fontSize: 8, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: 190, minWidth: 155, minHeight: 118, gap: 9, padding: 14 },
  metricLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  metricValue: { color: colors.text, fontSize: 23, fontWeight: '900', letterSpacing: -0.7, fontVariant: ['tabular-nums'] },
  metricNote: { color: colors.muted, fontSize: 9 },
  chartPanel: { gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTotal: { color: colors.accentStrong, fontSize: 10, fontWeight: '900' },
  chartBars: { height: 160, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartTrack: { height: '100%', width: '100%', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 5, backgroundColor: colors.surfaceRaised },
  chartFill: { width: '100%', borderRadius: 5, backgroundColor: colors.accentStrong },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: colors.dim, fontSize: 8 },
  emptyNote: { color: colors.dim, fontSize: 9, lineHeight: 14 },
  engagementPanel: { gap: 12 },
  commentRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceRaised },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  commentCopy: { flex: 1, minWidth: 0, gap: 3 },
  commentUser: { color: colors.text, fontSize: 9, fontWeight: '800' },
  commentBody: { color: colors.muted, fontSize: 9 },
  commentDate: { color: colors.dim, fontSize: 7 },
});
