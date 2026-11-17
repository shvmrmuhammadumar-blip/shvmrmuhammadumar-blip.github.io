import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioChip, StudioMetric, StudioSection } from '../../../components/studio/StudioWidgets';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Mode = 'followers' | 'following';
type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; created_at: string };
type AudienceData = { followers: number; following: number; recentFollowers: number; people: Person[] };

export default function StudioAudienceScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('followers');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<AudienceData>({ followers: 0, following: 0, recentFollowers: 0, people: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [followersCount, followingCount, recentCount, followerRows, followingRows] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId).gte('created_at', since),
      supabase.from('follows')
        .select('created_at, person:profiles!follows_follower_id_fkey(id, username, full_name, avatar_url)')
        .eq('following_id', userId).order('created_at', { ascending: false }).limit(100),
      supabase.from('follows')
        .select('created_at, person:profiles!follows_following_id_fkey(id, username, full_name, avatar_url)')
        .eq('follower_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);
    for (const result of [followersCount, followingCount, recentCount, followerRows, followingRows]) {
      if (result.error) throw result.error;
    }
    const normalize = (rows: any[]): Person[] => rows.flatMap((row) => {
      const person = row.person;
      return person?.id ? [{ ...person, created_at: row.created_at }] : [];
    });
    setData({
      followers: followersCount.count ?? 0,
      following: followingCount.count ?? 0,
      recentFollowers: recentCount.count ?? 0,
      people: mode === 'followers' ? normalize(followerRows.data ?? []) : normalize(followingRows.data ?? []),
    });
    setError('');
  }, [userId, mode]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Audience could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const visiblePeople = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.people;
    return data.people.filter((person) => `${person.username ?? ''} ${person.full_name ?? ''}`.toLowerCase().includes(term));
  }, [data.people, search]);

  return (
    <StudioFrame title="Audience" subtitle="People around your profile" icon="people-outline">
      <View style={styles.headingBlock}>
        <Text style={styles.heading}>Audience</Text>
        <Text style={styles.subheading}>Understand who follows your work.</Text>
      </View>
      <View style={styles.metrics}>
        <StudioMetric label="Followers" value={data.followers.toLocaleString()} icon="people-outline" />
        <StudioMetric label="Following" value={data.following.toLocaleString()} icon="person-add-outline" />
        <StudioMetric label="New · 30 days" value={data.recentFollowers.toLocaleString()} icon="trending-up-outline" />
      </View>
      <View style={styles.tabs}>
        <StudioChip label={`Followers · ${data.followers}`} active={mode === 'followers'} onPress={() => setMode('followers')} />
        <StudioChip label={`Following · ${data.following}`} active={mode === 'following'} onPress={() => setMode('following')} />
      </View>
      <StudioPanel style={styles.listPanel}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.muted} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search people" placeholderTextColor={colors.dim} style={styles.searchInput} autoCapitalize="none" />
        </View>
        <StudioSection title={mode === 'followers' ? 'Recent followers' : 'Following'} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 24 }} /> : null}
        {!loading && !visiblePeople.length ? (
          <View style={styles.empty}><Ionicons name="people-outline" size={23} color={colors.dim} /><Text style={styles.emptyText}>No accounts found.</Text></View>
        ) : null}
        {visiblePeople.map((person) => (
          <Pressable key={person.id} onPress={() => router.push(`/user/${person.id}`)} style={styles.personRow} accessibilityRole="button">
            {person.avatar_url ? <Image source={{ uri: person.avatar_url }} style={styles.avatar} /> : (
              <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{(person.username ?? 'L').slice(0, 1).toUpperCase()}</Text></View>
            )}
            <View style={styles.personCopy}>
              <Text style={styles.personName} numberOfLines={1}>{person.full_name || person.username || 'Lumo member'}</Text>
              <Text style={styles.personHandle}>@{person.username ?? 'user'}</Text>
            </View>
            <Text style={styles.personDate}>{new Date(person.created_at).toLocaleDateString()}</Text>
            <Ionicons name="chevron-forward" size={15} color={colors.dim} />
          </Pressable>
        ))}
      </StudioPanel>
      <Text style={styles.footnote}>Follower history is based on follow records currently available to your account.</Text>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingBlock: { gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  listPanel: { gap: 14, paddingHorizontal: 12 },
  searchBox: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  searchInput: { flex: 1, color: colors.text, fontSize: 12, paddingVertical: 8, outlineStyle: 'none' as never },
  error: { color: colors.danger, fontSize: 11 },
  empty: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.muted, fontSize: 11 },
  personRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceRaised },
  avatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  avatarInitial: { color: colors.accentStrong, fontSize: 14, fontWeight: '800' },
  personCopy: { flex: 1, minWidth: 0, gap: 4 },
  personName: { color: colors.text, fontSize: 11, fontWeight: '800' },
  personHandle: { color: colors.muted, fontSize: 10 },
  personDate: { color: colors.dim, fontSize: 9 },
  footnote: { color: colors.dim, fontSize: 9, lineHeight: 14 },
});
