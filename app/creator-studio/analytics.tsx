import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { StudioChip, StudioMetric, StudioSection } from '../../components/studio/StudioWidgets';
import { getPeriodStart, formatStudioNumber, loadCreatorContentEvents } from '../../lib/studio-data';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { useStudioStyles } from '../../lib/theme-styles';

type Period = '7d' | '30d' | '90d' | 'all';
type AnalyticsData = {
  posts: number;
  followers: number;
  likes: number;
  postOpens: number;
  storyOpens: number;
  uniqueViewers: number;
  dailyOpens: number[];
  chartStart: Date;
};

const periods: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'all', label: 'All time' },
];

function getChartRange(period: Period, oldestEvent: string | undefined) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = period === 'all' && oldestEvent
    ? new Date(oldestEvent)
    : new Date(today);

  if (period === 'all' && oldestEvent) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - ((period === '7d' ? 7 : period === '30d' ? 30 : 90) - 1));
  }

  const spanDays = Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  const targetBuckets = period === '7d' ? 7 : period === '30d' ? 15 : 30;
  const daysPerBucket = Math.max(1, Math.ceil(spanDays / targetBuckets));
  const bucketCount = Math.max(1, Math.ceil(spanDays / daysPerBucket));

  return { start, spanDays, daysPerBucket, bucketCount };
}

export default function StudioAnalyticsScreen() {
  const lumoStyles = useStudioStyles(styles);
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<AnalyticsData>({
    posts: 0,
    followers: 0,
    likes: 0,
    postOpens: 0,
    storyOpens: 0,
    uniqueViewers: 0,
    dailyOpens: [],
    chartStart: new Date(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const since = getPeriodStart(period);
    const postsQuery = supabase.from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    const followersQuery = supabase.from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', userId);
    const likesQuery = supabase.from('likes')
      .select('post_id, posts!inner(user_id)', { count: 'exact', head: true })
      .eq('posts.user_id', userId);

    if (since) {
      postsQuery.gte('created_at', since);
      followersQuery.gte('created_at', since);
      likesQuery.gte('created_at', since);
    }

    const [postsResult, followersResult, likesResult, events] = await Promise.all([
      postsQuery,
      followersQuery,
      likesQuery,
      loadCreatorContentEvents(userId, since),
    ]);

    for (const result of [postsResult, followersResult, likesResult]) {
      if (result.error) throw result.error;
    }

    const range = getChartRange(period, events[0]?.occurred_at);
    const daily = Array.from({ length: range.bucketCount }, () => 0);
    const uniqueViewers = new Set(events.map((event) => event.viewer_id)).size;

    for (const event of events) {
      const date = new Date(event.occurred_at);
      date.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((date.getTime() - range.start.getTime()) / 86400000);
      const bucketIndex = Math.floor(dayIndex / range.daysPerBucket);
      if (bucketIndex >= 0 && bucketIndex < daily.length) daily[bucketIndex] += 1;
    }

    setData({
      posts: postsResult.count ?? 0,
      followers: followersResult.count ?? 0,
      likes: likesResult.count ?? 0,
      postOpens: events.filter((event) => event.content_type === 'post').length,
      storyOpens: events.filter((event) => event.content_type === 'story').length,
      uniqueViewers,
      dailyOpens: daily,
      chartStart: range.start,
    });
    setError('');
  }, [userId, period]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Analytics could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]));

  const totalOpens = data.postOpens + data.storyOpens;
  const maxBar = Math.max(1, ...data.dailyOpens);
  const chartStartLabel = useMemo(
    () => data.chartStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: period === 'all' ? 'numeric' : undefined }),
    [data.chartStart, period],
  );

  return (
    <StudioFrame title="Analytics" subtitle="Measured account performance" icon="analytics-outline">
      <View style={lumoStyles.introRow}>
        <View style={lumoStyles.introCopy}>
          <Text style={lumoStyles.heading}>Performance</Text>
          <Text style={lumoStyles.subheading}>Your account, based on recorded activity.</Text>
        </View>
        <View style={lumoStyles.filters}>
          {periods.map((item) => (
            <StudioChip key={item.key} label={item.label} active={period === item.key} onPress={() => setPeriod(item.key)} />
          ))}
        </View>
      </View>

      {error ? <Text style={lumoStyles.error}>{error}</Text> : null}
      {loading ? <View style={lumoStyles.loading}><ActivityIndicator color={colors.accentStrong} /></View> : null}

      <View style={lumoStyles.metrics}>
        <StudioMetric label="Content opens" value={formatStudioNumber(totalOpens)} icon="eye-outline" note="Post + story opens" />
        <StudioMetric label="Unique viewers" value={formatStudioNumber(data.uniqueViewers)} icon="people-outline" note="Distinct accounts" />
        <StudioMetric label={period === 'all' ? 'Followers' : 'New followers'} value={formatStudioNumber(data.followers)} icon="person-add-outline" />
        <StudioMetric label="Likes received" value={formatStudioNumber(data.likes)} icon="heart-outline" />
      </View>

      <StudioPanel style={lumoStyles.chartPanel}>
        <StudioSection title={period === 'all' ? 'All-time content activity' : 'Content opens'} />
        {data.dailyOpens.length ? (
          <View style={lumoStyles.chartWrap}>
            <View style={lumoStyles.barRow}>
              {data.dailyOpens.map((value, index) => (
                <View key={index} style={lumoStyles.barColumn}>
                  <View style={lumoStyles.barTrack}>
                    <View style={[lumoStyles.barFill, { height: `${Math.max(4, (value / maxBar) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
            <View style={lumoStyles.axisRow}>
              <Text style={lumoStyles.axisLabel}>{period === 'all' ? chartStartLabel : period === '7d' ? '7 days ago' : period === '30d' ? '30 days ago' : '90 days ago'}</Text>
              <Text style={lumoStyles.axisLabel}>Today</Text>
            </View>
          </View>
        ) : null}
        <View style={lumoStyles.legendRow}>
          <View style={lumoStyles.legendDot} />
          <Text style={lumoStyles.legendText}>Opened posts and stories</Text>
          <Text style={lumoStyles.legendValue}>{formatStudioNumber(totalOpens)}</Text>
        </View>
      </StudioPanel>

      <StudioPanel style={lumoStyles.breakdownPanel}>
        <StudioSection title="Content breakdown" />
        <View style={lumoStyles.breakdownRow}>
          <View style={lumoStyles.breakdownLabel}><View style={lumoStyles.postDot} /><Text style={lumoStyles.breakdownText}>Post opens</Text></View>
          <Text style={lumoStyles.breakdownValue}>{formatStudioNumber(data.postOpens)}</Text>
        </View>
        <View style={lumoStyles.breakdownRow}>
          <View style={lumoStyles.breakdownLabel}><View style={lumoStyles.storyDot} /><Text style={lumoStyles.breakdownText}>Story opens</Text></View>
          <Text style={lumoStyles.breakdownValue}>{formatStudioNumber(data.storyOpens)}</Text>
        </View>
        <View style={lumoStyles.divider} />
        <View style={lumoStyles.breakdownRow}>
          <Text style={lumoStyles.breakdownText}>Published in period</Text>
          <Text style={lumoStyles.breakdownValue}>{formatStudioNumber(data.posts)}</Text>
        </View>
      </StudioPanel>

      <View style={lumoStyles.note}>
        <Text style={lumoStyles.noteTitle}>Measurement scope</Text>
        <Text style={lumoStyles.noteText}>Opens count only recorded post and story opens. Feed impressions, video watch time and retention are not included in these figures.</Text>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  introRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  introCopy: { flex: 1, minWidth: 180, gap: 4 },
  heading: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  loading: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17 },
  chartPanel: { gap: 16, padding: 20 },
  chartWrap: { gap: 10 },
  barRow: { height: 170, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: 8 },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', width: '100%', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 5, backgroundColor: colors.surfaceRaised },
  barFill: { width: '100%', borderRadius: 5, backgroundColor: colors.accent },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  axisLabel: { color: colors.dim, fontSize: 11, flexShrink: 1 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong },
  legendText: { flex: 1, color: colors.muted, fontSize: 12 },
  legendValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  breakdownPanel: { gap: 14, padding: 20 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  breakdownLabel: { flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  postDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong },
  storyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verified },
  breakdownText: { color: colors.muted, fontSize: 12 },
  breakdownValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
  note: { paddingHorizontal: 2, gap: 6 },
  noteTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  noteText: { color: colors.dim, fontSize: 11, lineHeight: 17 },
});
