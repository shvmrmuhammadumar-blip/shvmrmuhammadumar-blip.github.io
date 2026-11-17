import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioMetric } from '../../../components/studio/StudioWidgets';
import { formatStudioNumber, loadStudioOverview, type StudioOverview } from '../../../lib/studio-data';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Profile = { username: string | null; full_name: string | null; bio: string | null; avatar_url: string | null };

export default function StudioMediaKitScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<StudioOverview | null>(null);
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
      if (active) setError(reason instanceof Error ? reason.message : 'Media kit could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const shareKit = async () => {
    if (!profile || !data) return;
    const label = data.accountType === 'business' ? 'Business' : data.accountType === 'creator' ? 'Creator' : 'Lumo member';
    const message = [
      profile.full_name || profile.username || 'Lumo creator',
      `@${profile.username ?? 'user'} · ${label}`,
      profile.bio ?? '',
      `Followers: ${data.followers.toLocaleString()}`,
      `Published posts: ${data.posts.toLocaleString()}`,
      `Likes received: ${data.likes.toLocaleString()}`,
      'Find me on Lumo.',
    ].filter(Boolean).join('\n');
    await Share.share({ message });
  };

  return (
    <StudioFrame title="Media Kit" subtitle="A shareable creator profile" icon="document-text-outline">
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>Media Kit</Text>
        <Text style={styles.subheading}>A compact introduction for potential partners.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 18 }} /> : null}

      {profile && data ? (
        <>
          <StudioPanel style={styles.kitCard}>
            <View style={styles.kitHeader}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : (
                <View style={styles.avatarFallback}><Ionicons name="person" size={24} color={colors.muted} /></View>
              )}
              <View style={styles.identity}>
                <Text style={styles.name}>{profile.full_name || profile.username || 'Lumo creator'}</Text>
                <Text style={styles.handle}>@{profile.username ?? 'user'}</Text>
                <Text style={styles.category}>{data.category || (data.accountType === 'business' ? 'BUSINESS' : data.accountType === 'creator' ? 'CREATOR' : 'LUMO MEMBER')}</Text>
              </View>
              <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
            </View>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.bioEmpty}>Add a short bio to complete your media kit.</Text>}
            <View style={styles.stats}>
              <View style={styles.stat}><Text style={styles.statValue}>{formatStudioNumber(data.followers)}</Text><Text style={styles.statLabel}>FOLLOWERS</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{formatStudioNumber(data.posts)}</Text><Text style={styles.statLabel}>POSTS</Text></View>
              <View style={styles.statDivider} />
              <View style={styles.stat}><Text style={styles.statValue}>{formatStudioNumber(data.likes)}</Text><Text style={styles.statLabel}>LIKES</Text></View>
            </View>
            <Text style={styles.kitFooter}>LUMO  ·  CREATOR PROFILE</Text>
          </StudioPanel>
          <Pressable onPress={() => void shareKit()} style={styles.shareButton} accessibilityRole="button">
            <Ionicons name="share-outline" size={17} color={colors.bg} />
            <Text style={styles.shareText}>Share media kit</Text>
          </Pressable>
          <Pressable onPress={() => void Share.share({ message: `Find @${profile.username ?? 'user'} on Lumo.` })} style={styles.profileButton} accessibilityRole="button">
            <Ionicons name="person-circle-outline" size={17} color={colors.accentStrong} />
            <Text style={styles.profileButtonText}>Share profile</Text>
          </Pressable>
        </>
      ) : null}
      <Text style={styles.note}>This media kit uses live Lumo profile and engagement totals. It does not include verified reach, demographics or paid campaign results.</Text>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  error: { color: colors.danger, fontSize: 11 },
  kitCard: { padding: 22, gap: 18, borderRadius: 22 },
  kitHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.surfaceRaised },
  avatarFallback: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  identity: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 16, fontWeight: '900' },
  handle: { color: colors.muted, fontSize: 11 },
  category: { color: colors.accentStrong, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  bio: { color: colors.text, fontSize: 12, lineHeight: 19 },
  bioEmpty: { color: colors.dim, fontSize: 11, fontStyle: 'italic' },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.7 },
  statLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 0.9 },
  statDivider: { width: 1, height: 34, backgroundColor: colors.border },
  kitFooter: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  shareButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: colors.accent },
  shareText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  profileButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profileButtonText: { color: colors.accentStrong, fontSize: 11, fontWeight: '800' },
  note: { color: colors.dim, fontSize: 9, lineHeight: 14 },
});
