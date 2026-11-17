import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioChip, StudioMetric, StudioSection } from '../../../components/studio/StudioWidgets';
import { getPeriodStart, formatStudioNumber } from '../../../lib/studio-data';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Period = '7d' | '30d' | '90d' | 'all';
type AnalyticsData = {
  posts: number;
  followers: number;
  likes: number;
  postOpens: number;
  storyOpens: number;
  uniqueViewers: number;
  dailyOpens: number[];
};

const periods: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'all', label: 'All time' },
];

export default function StudioAnalyticsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [period, setPeriod] = useState<Period>('30d');
  const [data, setData] = useState<AnalyticsData>({
    posts: 0, followers: 0, likes: 0, postOpens: 0, storyOpens: 0, uniqueViewers: 0, dailyOpens: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const since = getPeriodStart(period);
    const postsQuery = supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const followersQuery = supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId);
    const likesQuery = supabase.from('likes').select('post_id, posts!inner(user_id)', { count: 'exact', head: true }).eq('posts.user_id', userId);
    const eventsQuery = supabase.from('creator_content_events')
      .select('viewer_id, content_type, occurred_at', { count: 'exact' })
      .eq('owner_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(1500);

    if (since) {
      postsQuery.gte('created_at', since);
      followersQuery.gte('created_at', since);
      likesQuery.gte('created_at', since);
      eventsQuery.gte('occurred_at', since);
    }

    const [postsResult, followersResult, likesResult, eventsResult] = await Promise.all([
      postsQuery, followersQuery, likesQuery, eventsQuery,
    ]);
    for (const result of [postsResult, followersResult, likesResult, eventsResult]) {
      if (result.error) throw result.error;
    }

    const events = eventsResult.data ?? [];
    const uniqueViewers = new Set(events.map((event) => event.viewer_id)).size;
    const spanDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const bucketCount = period === '7d' ? 7 : period === '30d' ? 15 : 30;
    const bucketDays = Math.ceil(spanDays / bucketCount);
    const daily = Array.from({ length: bucketCount }, () => 0);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (spanDays - 1));
    for (const event of events) {
      const d = new Date(event.occurred_at);
      d.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((d.getTime() - start.getTime()) / 86400000);
      const bucketIndex = Math.floor(dayIndex / bucketDays);
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
    });
    setError('');
  }, [userId, period]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Analytics could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const totalOpens = data.postOpens + data.storyOpens;
  const maxBar = Math.max(1, ...data.dailyOpens);

  return (
    <StudioFrame title="Analytics" subtitle="Measured account performance" icon="analytics-outline">
      <View style={styles.introRow}>
        <View style={styles.introCopy}>
          <Text style={styles.heading}>Performance</Text>
          <Text style={styles.subheading}>Your account, based on recorded activity.</Text>
        </View>
        <View style={styles.filters}>
          {periods.map((item) => <StudioChip key={item.key} label={item.label} active={period === item.key} onPress={() => setPeriod(item.key)} />)}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accentStrong} /></View> : null}

      <View style={styles.metrics}>
        <StudioMetric label="Content opens" value={formatStudioNumber(totalOpens)} icon="eye-outline" note="Post + story opens" />
        <StudioMetric label="Unique viewers" value={formatStudioNumber(data.uniqueViewers)} icon="people-outline" note="Distinct accounts" />
        <StudioMetric label="New followers" value={formatStudioNumber(data.followers)} icon="person-add-outline" />
        <StudioMetric label="Likes received" value={formatStudioNumber(data.likes)} icon="heart-outline" />
      </View>

      <StudioPanel style={styles.chartPanel}>
        <StudioSection title="Content opens" />
        {data.dailyOpens.length ? (
          <View style={styles.chartWrap}>
            <View style={styles.barRow}>
              {data.dailyOpens.map((value, index) => (
                <View key={index} style={styles.barColumn}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${Math.max(4, (value / maxBar) * 100)}%` }]} />
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.axisRow}>
              <Text style={styles.axisLabel}>{period === '7d' ? '7 days ago' : period === '30d' ? '30 days ago' : '90 days ago'}</Text>
              <Text style={styles.axisLabel}>Today</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.legendRow}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>Opened posts and stories</Text>
          <Text style={styles.legendValue}>{formatStudioNumber(totalOpens)}</Text>
        </View>
      </StudioPanel>

      <StudioPanel style={styles.breakdownPanel}>
        <StudioSection title="Content breakdown" />
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLabel}><View style={styles.postDot} /><Text style={styles.breakdownText}>Post opens</Text></View>
          <Text style={styles.breakdownValue}>{formatStudioNumber(data.postOpens)}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <View style={styles.breakdownLabel}><View style={styles.storyDot} /><Text style={styles.breakdownText}>Story opens</Text></View>
          <Text style={styles.breakdownValue}>{formatStudioNumber(data.storyOpens)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownText}>Published in period</Text>
          <Text style={styles.breakdownValue}>{formatStudioNumber(data.posts)}</Text>
        </View>
      </StudioPanel>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Measurement scope</Text>
        <Text style={styles.noteText}>Opens are recorded when someone enters a post or story viewer. Feed impressions, reach, video watch time and retention are not included yet.</Text>
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  introRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  introCopy: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  loading: { minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, fontSize: 11 },
  chartPanel: { gap: 16 },
  chartWrap: { gap: 8 },
  barRow: { height: 160, flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingTop: 8 },
  barColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', width: '100%', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 5, backgroundColor: colors.surfaceRaised },
  barFill: { width: '100%', borderRadius: 5, backgroundColor: colors.accent },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { color: colors.dim, fontSize: 9 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong },
  legendText: { flex: 1, color: colors.muted, fontSize: 10 },
  legendValue: { color: colors.text, fontSize: 12, fontWeight: '800' },
  breakdownPanel: { gap: 13 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  postDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentStrong },
  storyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.verified },
  breakdownText: { color: colors.muted, fontSize: 11 },
  breakdownValue: { color: colors.text, fontSize: 12, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
  note: { paddingHorizontal: 2, gap: 5 },
  noteTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  noteText: { color: colors.dim, fontSize: 10, lineHeight: 16 },
});
