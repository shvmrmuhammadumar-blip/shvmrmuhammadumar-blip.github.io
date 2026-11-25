import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { StudioMetric } from '../../components/studio/StudioWidgets';
import { formatStudioNumber, loadStudioOverview, type StudioOverview } from '../../lib/studio-data';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { useStudioStyles } from "../../lib/theme-styles";

type Profile = { username: string | null; full_name: string | null; bio: string | null; avatar_url: string | null };

export default function StudioMediaKitScreen() {
  const lumoStyles = useStudioStyles(styles);
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
      <View style={lumoStyles.headingBlock}>
        <Text style={lumoStyles.heading}>Media Kit</Text>
        <Text style={lumoStyles.subheading}>A compact introduction for potential partners.</Text>
      </View>
      {error ? <Text style={lumoStyles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 18 }} /> : null}

      {profile && data ? (
        <>
          <StudioPanel style={lumoStyles.kitCard}>
            <View style={lumoStyles.kitHeader}>
              {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={lumoStyles.avatar} /> : (
                <View style={lumoStyles.avatarFallback}><Ionicons name="person" size={24} color={colors.muted} /></View>
              )}
              <View style={lumoStyles.identity}>
                <Text style={lumoStyles.name}>{profile.full_name || profile.username || 'Lumo creator'}</Text>
                <Text style={lumoStyles.handle}>@{profile.username ?? 'user'}</Text>
                <Text style={lumoStyles.category}>{data.category || (data.accountType === 'business' ? 'BUSINESS' : data.accountType === 'creator' ? 'CREATOR' : 'LUMO MEMBER')}</Text>
              </View>
              <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
            </View>
            {profile.bio ? <Text style={lumoStyles.bio}>{profile.bio}</Text> : <Text style={lumoStyles.bioEmpty}>Add a short bio to complete your media kit.</Text>}
            <View style={lumoStyles.stats}>
              <View style={lumoStyles.stat}><Text style={lumoStyles.statValue}>{formatStudioNumber(data.followers)}</Text><Text style={lumoStyles.statLabel}>FOLLOWERS</Text></View>
              <View style={lumoStyles.statDivider} />
              <View style={lumoStyles.stat}><Text style={lumoStyles.statValue}>{formatStudioNumber(data.posts)}</Text><Text style={lumoStyles.statLabel}>POSTS</Text></View>
              <View style={lumoStyles.statDivider} />
              <View style={lumoStyles.stat}><Text style={lumoStyles.statValue}>{formatStudioNumber(data.likes)}</Text><Text style={lumoStyles.statLabel}>LIKES</Text></View>
            </View>
            <Text style={lumoStyles.kitFooter}>LUMO  ·  CREATOR PROFILE</Text>
          </StudioPanel>
          <Pressable onPress={() => void shareKit()} style={lumoStyles.shareButton} accessibilityRole="button">
            <Ionicons name="share-outline" size={17} color={colors.bg} />
            <Text style={lumoStyles.shareText}>Share media kit</Text>
          </Pressable>
          <Pressable onPress={() => void Share.share({ message: `Find @${profile.username ?? 'user'} on Lumo.` })} style={lumoStyles.profileButton} accessibilityRole="button">
            <Ionicons name="person-circle-outline" size={17} color={colors.accentStrong} />
            <Text style={lumoStyles.profileButtonText}>Share profile</Text>
          </Pressable>
        </>
      ) : null}
      <Text style={lumoStyles.note}>This media kit uses live Lumo profile and engagement totals. It does not include verified reach, demographics or paid campaign results.</Text>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, fontSize: 11 },
  kitCard: { padding: 22, gap: 18, borderRadius: 22 },
  kitHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.surfaceRaised },
  avatarFallback: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: colors.text, fontSize: 16, fontWeight: '900' },
  handle: { color: colors.muted, fontSize: 11 },
  category: { color: colors.accentStrong, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.1 },
  bio: { color: colors.text, fontSize: 12, lineHeight: 19 },
  bioEmpty: { color: colors.dim, fontSize: 11, fontStyle: 'italic' },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.7 },
  statLabel: { color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.9 },
  statDivider: { width: 1, height: 34, backgroundColor: colors.border },
  kitFooter: { color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.5 },
  shareButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: colors.accent },
  shareText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  profileButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profileButtonText: { color: colors.accentStrong, fontSize: 11, fontWeight: '800' },
  note: { color: colors.dim, fontSize: 10.5, lineHeight: 14 },
});
