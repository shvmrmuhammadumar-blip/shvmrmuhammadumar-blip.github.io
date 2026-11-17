import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioMetric, StudioSection } from '../../../components/studio/StudioWidgets';
import { loadStudioOverview, formatStudioNumber, type StudioOverview } from '../../../lib/studio-data';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Profile = { username: string | null; full_name: string | null; bio: string | null; avatar_url: string | null };

export default function StudioGrowthScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const [data, setData] = useState<StudioOverview | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const [overview, profileResult] = await Promise.all([
      loadStudioOverview(userId),
      supabase.from('profiles').select('username, full_name, bio, avatar_url').eq('id', userId).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    setData(overview);
    setProfile(profileResult.data as Profile | null);
    setError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Growth data could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const profileParts = [profile?.full_name, profile?.avatar_url, profile?.bio?.trim()].filter(Boolean).length;
  const readiness = Math.round((profileParts / 3) * 100);
  const actions = useMemo(() => {
    const items: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; detail: string; button: string; path: string }[] = [];
    if (!profile?.avatar_url || !profile?.full_name || !profile?.bio?.trim()) {
      items.push({ icon: 'person-circle-outline', title: 'Complete your profile', detail: 'Add a clear avatar, name and short bio.', button: 'Edit profile', path: '/edit-profile' });
    }
    if (!data?.posts) {
      items.push({ icon: 'add-circle-outline', title: 'Publish your first post', detail: 'Start building a library people can discover.', button: 'Create', path: '/create' });
    } else {
      items.push({ icon: 'calendar-outline', title: 'Plan your next post', detail: 'Keep a consistent publishing rhythm.', button: 'Open planner', path: '/studio/planner' });
    }
    if (!data?.uniqueViewers) {
      items.push({ icon: 'share-social-outline', title: 'Bring people to your content', detail: 'Share your profile or a recent post with your audience.', button: 'Media kit', path: '/studio/media-kit' });
    } else {
      items.push({ icon: 'analytics-outline', title: 'Review content performance', detail: 'Compare post and story opens with your likes.', button: 'Analytics', path: '/studio/analytics' });
    }
    return items;
  }, [profile, data]);

  return (
    <StudioFrame title="Growth Lab" subtitle="Practical actions from your account data" icon="trending-up-outline">
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>Growth Lab</Text>
        <Text style={styles.subheading}>A focused set of next steps for your account.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 18 }} /> : null}

      <StudioPanel style={styles.readinessPanel}>
        <View style={styles.readinessTop}>
          <View style={styles.readinessCopy}>
            <Text style={styles.readinessTitle}>Profile readiness</Text>
            <Text style={styles.readinessSub}>{profileParts} of 3 essentials completed</Text>
          </View>
          <Text style={styles.readinessValue}>{readiness}%</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${readiness}%` }]} /></View>
      </StudioPanel>

      {data ? (
        <View style={styles.metrics}>
          <StudioMetric label="Followers" value={formatStudioNumber(data.followers)} icon="people-outline" />
          <StudioMetric label="Published" value={formatStudioNumber(data.posts)} icon="images-outline" />
          <StudioMetric label="Likes" value={formatStudioNumber(data.likes)} icon="heart-outline" />
          <StudioMetric label="Unique viewers" value={formatStudioNumber(data.uniqueViewers)} icon="eye-outline" />
        </View>
      ) : null}

      <StudioSection title="Recommended next steps" />
      <View style={styles.actions}>
        {actions.map((item) => (
          <StudioPanel key={item.title} style={styles.actionCard}>
            <View style={styles.actionIcon}><Ionicons name={item.icon} size={19} color={colors.accentStrong} /></View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionDetail}>{item.detail}</Text>
            </View>
            <Pressable onPress={() => router.push(item.path as never)} style={styles.actionButton} accessibilityRole="button">
              <Text style={styles.actionButtonText}>{item.button}</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.accentStrong} />
            </Pressable>
          </StudioPanel>
        ))}
      </View>
      <Text style={styles.note}>Recommendations use your saved profile and recorded Lumo activity. They are not predictions or guaranteed growth results.</Text>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  error: { color: colors.danger, fontSize: 11 },
  readinessPanel: { gap: 14 },
  readinessTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  readinessCopy: { gap: 4 },
  readinessTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  readinessSub: { color: colors.muted, fontSize: 10 },
  readinessValue: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  progressTrack: { height: 7, borderRadius: 5, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { gap: 10 },
  actionCard: { gap: 9 },
  actionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised },
  actionCopy: { gap: 4 },
  actionTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  actionDetail: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  actionButton: { minHeight: 34, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  actionButtonText: { color: colors.accentStrong, fontSize: 10, fontWeight: '800' },
  note: { color: colors.dim, fontSize: 9, lineHeight: 14 },
});
