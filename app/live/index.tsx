import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { LIVE_CATEGORIES, listLiveSessions, type LiveCategory, type LiveSession } from '../../lib/live';

type LiveCardData = LiveSession & { participant_count: number };

export default function LiveScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [sessions, setSessions] = useState<LiveCardData[]>([]);
  const [activeCategory, setActiveCategory] = useState<LiveCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveIdInput, setLiveIdInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!userId) return;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const rows = await listLiveSessions(activeCategory);
      setSessions(rows as LiveCardData[]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load live sessions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, activeCategory]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`live-discovery:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions' }, () => {
        void load(true);
      })
      .subscribe();
    const timer = setInterval(() => void load(true), 30000);
    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const featured = sessions[0];
  const otherSessions = useMemo(() => featured ? sessions.filter(item => item.id !== featured.id) : sessions, [sessions, featured]);

  const openSession = (liveCode: string) => router.push('/live/' + liveCode as never);
  const joinById = () => {
    const input = liveIdInput.trim();
    const codeMatch = input.match(/(?:^|\/)([0-9]{8})(?:[/?#]|$)/);
    const uuidMatch = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const identifier = /^[0-9]{8}$/.test(input) ? input : codeMatch?.[1] ?? uuidMatch?.[0];
    if (!identifier) {
      setJoinError('Enter an 8-digit LUMO LIVE ID or paste its link.');
      return;
    }
    setJoinError(null);
    router.push('/live/' + identifier as never);
  };
  const categoryLabel = (category: string) => LIVE_CATEGORIES.find(item => item.key === category)?.label ?? 'Live';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Ionicons name="radio" size={19} color="#0D1117" /></View>
          <Text style={styles.brand}>LUMO <Text style={styles.brandLive}>LIVE</Text></Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.homeButton} onPress={() => router.replace('/' as never)} accessibilityRole="button" accessibilityLabel="Go to Home">
            <Ionicons name="home-outline" size={15} color={colors.text} />
            <Text style={styles.homeButtonText}>Home</Text>
          </Pressable>
          <Pressable style={styles.refreshButton} onPress={() => void load(true)} accessibilityLabel="Refresh live sessions">
            {refreshing ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="refresh" size={18} color={colors.text} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>HAPPENING NOW</Text></View>
          <Text style={styles.heroEyebrow}>YOUR WORLD, LIVE</Text>
        </View>
        <Text style={styles.heroTitle}>Be here when it happens.</Text>
        <Text style={styles.heroCopy}>Real voices. Real moments. Your people on one stage.</Text>
        <View style={styles.heroBottom}>
          <View style={styles.heroPeople}>
            <View style={[styles.avatarDot, styles.avatarOne]}><Ionicons name="person" size={13} color="#11161C" /></View>
            <View style={[styles.avatarDot, styles.avatarTwo]}><Ionicons name="person" size={13} color="#11161C" /></View>
            <View style={[styles.avatarDot, styles.avatarThree]}><Ionicons name="person" size={13} color="#11161C" /></View>
            <Text style={styles.heroPeopleText}>{sessions.length ? `${sessions.length} live rooms` : 'Your circle is waiting'}</Text>
          </View>
          <Pressable style={styles.goLiveButton} onPress={() => router.push('/live/create' as never)}>
            <Ionicons name="videocam" size={16} color="#11161C" />
            <Text style={styles.goLiveText}>Go live</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.joinByIdCard}>
        <View style={styles.joinByIdHeading}>
          <View style={styles.joinByIdIcon}><Ionicons name="key-outline" size={17} color="#D6E3B4" /></View>
          <View style={styles.joinByIdCopy}>
            <Text style={styles.joinByIdTitle}>Have a LIVE ID?</Text>
            <Text style={styles.joinByIdSubtitle}>Open a shared room by ID. Followers-only rooms still require access.</Text>
          </View>
        </View>
        <View style={styles.joinByIdRow}>
          <TextInput
            value={liveIdInput}
            onChangeText={value => { setLiveIdInput(value); setJoinError(null); }}
            placeholder="Paste live ID or link"
            placeholderTextColor="#74808D"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.joinByIdInput}
            onSubmitEditing={joinById}
            returnKeyType="go"
          />
          <Pressable style={styles.joinByIdButton} onPress={joinById}>
            <Text style={styles.joinByIdButtonText}>Join</Text>
            <Ionicons name="arrow-forward" size={15} color="#11161C" />
          </Pressable>
        </View>
        {joinError ? <Text style={styles.joinByIdError}>{joinError}</Text> : null}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>THE LIVE STAGE</Text>
          <Text style={styles.sectionTitle}>Find your room</Text>
        </View>
        <View style={styles.liveCount}><View style={styles.liveCountDot} /><Text style={styles.liveCountText}>{sessions.length} LIVE</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <Pressable onPress={() => setActiveCategory('all')} style={[styles.filter, activeCategory === 'all' && styles.filterActive]}>
          <Text style={[styles.filterText, activeCategory === 'all' && styles.filterTextActive]}>For you</Text>
        </Pressable>
        {LIVE_CATEGORIES.map(category => (
          <Pressable key={category.key} onPress={() => setActiveCategory(category.key)} style={[styles.filter, activeCategory === category.key && styles.filterActive]}>
            <Text style={[styles.filterText, activeCategory === category.key && styles.filterTextActive]}>{category.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error ? (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color="#D8B879" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator size="large" color="#C9D9A4" /><Text style={styles.loadingText}>Finding live rooms</Text></View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}><Ionicons name="radio-outline" size={28} color="#D6E3B4" /></View>
          <Text style={styles.emptyTitle}>It is quiet on stage.</Text>
          <Text style={styles.emptyCopy}>Start the first LUMO LIVE and bring your circle together.</Text>
          <Pressable style={styles.emptyAction} onPress={() => router.push('/live/create' as never)}>
            <Text style={styles.emptyActionText}>Create your first live</Text>
            <Ionicons name="arrow-forward" size={16} color="#11161C" />
          </Pressable>
        </View>
      ) : (
        <>
          {featured ? (
            <Pressable style={styles.featuredCard} onPress={() => openSession(featured.live_code)}>
              {featured.cover_url ? (
                <Image source={{ uri: featured.cover_url }} style={styles.featuredImage} contentFit="cover" />
              ) : (
                <View style={styles.featuredBackdrop}>
                  <View style={styles.featuredOrbit} />
                  <Ionicons name="radio" size={54} color="rgba(220,230,200,0.28)" />
                </View>
              )}
              <View style={styles.featuredShade} />
              <View style={styles.featuredTop}>
                <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE NOW</Text></View>
                <View style={styles.viewerPill}><Ionicons name="people-outline" size={12} color="#F2F5F7" /><Text style={styles.viewerText}>{featured.participant_count.toLocaleString()}</Text></View>
              </View>
              <View style={styles.featuredInfo}>
                <Text style={styles.featuredCategory}>{categoryLabel(featured.category).toUpperCase()}</Text>
                <Text style={styles.featuredTitle} numberOfLines={2}>{featured.title}</Text>
                <View style={styles.hostLine}>
                  <View style={styles.hostAvatar}><Ionicons name="person" size={13} color="#11161C" /></View>
                  <Text style={styles.hostName}>@{featured.host?.username ?? 'lumo_creator'}</Text>
                  <View style={styles.featuredPlay}><Ionicons name="play" size={14} color="#11161C" /></View>
                </View>
              </View>
            </Pressable>
          ) : null}

          <View style={styles.cardGrid}>
            {otherSessions.map(item => (
              <Pressable key={item.id} style={styles.liveCard} onPress={() => openSession(item.live_code)}>
                <View style={styles.cardMedia}>
                  {item.cover_url ? <Image source={{ uri: item.cover_url }} style={styles.cardImage} contentFit="cover" /> : (
                    <View style={styles.cardFallback}><Ionicons name="radio" size={27} color="rgba(220,230,200,0.38)" /></View>
                  )}
                  <View style={styles.cardMediaShade} />
                  <View style={styles.cardLiveTag}><View style={styles.liveDot} /><Text style={styles.livePillText}>LIVE</Text></View>
                  <View style={styles.cardViewerTag}><Ionicons name="people-outline" size={11} color="#F2F5F7" /><Text style={styles.viewerText}>{item.participant_count}</Text></View>
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardCategory}>{categoryLabel(item.category).toUpperCase()}</Text>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.cardHost}>@{item.host?.username ?? 'lumo_creator'}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={styles.footerNote}>
        <Ionicons name="shield-checkmark-outline" size={15} color="#778392" />
        <Text style={styles.footerText}>Every stage has a host. Every guest is approved before joining.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090C12' },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 42, gap: 20, width: '100%', maxWidth: 920, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  homeButton: { height: 38, paddingHorizontal: 11, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#171D24', borderWidth: 1, borderColor: '#2B3440' },
  homeButtonText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center' },
  brand: { color: '#F2F5F7', fontSize: 17, fontWeight: '900', letterSpacing: 1.3 },
  brandLive: { color: '#F16D73', fontWeight: '900' },
  refreshButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#171D24', borderWidth: 1, borderColor: '#2B3440' },
  hero: { minHeight: 214, borderRadius: 23, overflow: 'hidden', padding: 19, backgroundColor: '#1A2426', borderWidth: 1, borderColor: 'rgba(201,217,164,0.25)', justifyContent: 'space-between' },
  heroGlow: { position: 'absolute', right: -52, top: -52, width: 210, height: 210, borderRadius: 110, backgroundColor: 'rgba(201,217,164,0.11)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  livePill: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(241,109,115,0.17)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F16D73' },
  livePillText: { color: '#FFD3D3', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  heroEyebrow: { color: '#C3D19E', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  heroTitle: { color: '#F4F5EF', fontSize: 26, lineHeight: 31, fontWeight: '900', maxWidth: 340 },
  heroCopy: { color: '#BAC7B5', fontSize: 11, lineHeight: 16, maxWidth: 310 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  heroPeople: { flexDirection: 'row', alignItems: 'center' },
  avatarDot: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A2426', marginRight: -7 },
  avatarOne: { backgroundColor: '#D6E3B4' },
  avatarTwo: { backgroundColor: '#E5B9A6' },
  avatarThree: { backgroundColor: '#9AB9B4', marginRight: 9 },
  heroPeopleText: { color: '#DCE6D7', fontSize: 9, fontWeight: '800' },
  goLiveButton: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#C9D9A4', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  goLiveText: { color: '#11161C', fontSize: 11, fontWeight: '900' },
  joinByIdCard: { padding: 14, gap: 11, borderRadius: 18, backgroundColor: '#111920', borderWidth: 1, borderColor: '#2B3940' },
  joinByIdHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinByIdIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#25302A', alignItems: 'center', justifyContent: 'center' },
  joinByIdCopy: { flex: 1, gap: 3 },
  joinByIdTitle: { color: '#F2F5F7', fontSize: 12, fontWeight: '900' },
  joinByIdSubtitle: { color: '#8F9CA7', fontSize: 9, lineHeight: 14 },
  joinByIdRow: { flexDirection: 'row', gap: 8 },
  joinByIdInput: { flex: 1, minWidth: 0, minHeight: 43, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#303B45', backgroundColor: '#0B1117', color: '#F2F5F7', fontSize: 11 },
  joinByIdButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#C9D9A4' },
  joinByIdButtonText: { color: '#11161C', fontSize: 10, fontWeight: '900' },
  joinByIdError: { color: '#E6A1A1', fontSize: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionEyebrow: { color: '#7F8B99', fontSize: 8, fontWeight: '900', letterSpacing: 1.7 },
  sectionTitle: { color: '#F2F5F7', fontSize: 21, fontWeight: '900', marginTop: 3 },
  liveCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveCountDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F16D73' },
  liveCountText: { color: '#C1C9D0', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  filters: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filter: { borderWidth: 1, borderColor: '#2B3440', backgroundColor: '#11161C', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999 },
  filterActive: { backgroundColor: '#C9D9A4', borderColor: '#C9D9A4' },
  filterText: { color: '#9AA5B2', fontSize: 10, fontWeight: '800' },
  filterTextActive: { color: '#10151A' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#211B16', borderColor: '#51432F', borderWidth: 1, borderRadius: 13, padding: 12 },
  errorText: { color: '#E0C89E', fontSize: 11, flex: 1 },
  loading: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#9AA5B2', fontSize: 11 },
  emptyCard: { minHeight: 220, backgroundColor: '#11171E', borderWidth: 1, borderColor: '#2B3440', borderRadius: 20, alignItems: 'center', justifyContent: 'center', padding: 23, gap: 11 },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#202A27', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: '#F2F5F7', fontSize: 17, fontWeight: '900' },
  emptyCopy: { color: '#9AA5B2', fontSize: 11, textAlign: 'center', lineHeight: 17, maxWidth: 280 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#C9D9A4', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 12, marginTop: 4 },
  emptyActionText: { color: '#10151A', fontSize: 10, fontWeight: '900' },
  featuredCard: { minHeight: 265, borderRadius: 21, overflow: 'hidden', backgroundColor: '#1B2526', borderWidth: 1, borderColor: '#34413B', justifyContent: 'space-between' },
  featuredImage: { ...StyleSheet.absoluteFillObject },
  featuredBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#202E2B', alignItems: 'center', justifyContent: 'center' },
  featuredOrbit: { position: 'absolute', width: 230, height: 230, borderRadius: 115, borderWidth: 1, borderColor: 'rgba(210,224,186,0.18)' },
  featuredShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,9,12,0.45)' },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', padding: 14 },
  viewerPill: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: 'rgba(8,12,16,0.62)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6 },
  viewerText: { color: '#F2F5F7', fontSize: 9, fontWeight: '800' },
  featuredInfo: { padding: 17, gap: 6 },
  featuredCategory: { color: '#D3E0B7', fontSize: 8, fontWeight: '900', letterSpacing: 1.6 },
  featuredTitle: { color: '#FAFBF7', fontSize: 22, fontWeight: '900', lineHeight: 27, maxWidth: 510 },
  hostLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  hostAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center' },
  hostName: { color: '#D9DFD6', fontSize: 10, fontWeight: '700', flex: 1 },
  featuredPlay: { width: 33, height: 33, borderRadius: 12, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  liveCard: { flexBasis: '48%', flexGrow: 1, maxWidth: '49%', borderRadius: 17, overflow: 'hidden', backgroundColor: '#121820', borderWidth: 1, borderColor: '#28313A' },
  cardMedia: { height: 112, backgroundColor: '#1C2725', position: 'relative' },
  cardImage: { ...StyleSheet.absoluteFillObject },
  cardFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#202E2B' },
  cardMediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,9,12,0.35)' },
  cardLiveTag: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: 'rgba(241,109,115,0.18)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99 },
  cardViewerTag: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(8,12,16,0.62)', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 99 },
  cardInfo: { padding: 11, gap: 4 },
  cardCategory: { color: '#BAC99A', fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  cardTitle: { color: '#F2F5F7', fontSize: 12, lineHeight: 16, fontWeight: '800', minHeight: 32 },
  cardHost: { color: '#8995A2', fontSize: 9, marginTop: 3 },
  footerNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 9 },
  footerText: { color: '#778392', fontSize: 9 },
});
