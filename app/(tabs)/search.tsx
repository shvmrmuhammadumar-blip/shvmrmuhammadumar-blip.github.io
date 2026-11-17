import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { getPublicChannels } from '../../lib/channels';
import { POST_SELECT } from '../../lib/api';
import type { Post, Profile } from '../../lib/types';

type Scope = 'People' | 'Posts' | 'Videos' | 'Groups' | 'Channels';
type SearchItem = {
  id: string;
  kind: 'person' | 'post' | 'video' | 'group' | 'channel';
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  route: string;
};

const scopes: Scope[] = ['People', 'Posts', 'Videos', 'Groups', 'Channels'];

export default function Search() {
  const { session } = useAuth();
  const me = session?.user?.id ?? '';
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('People');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const term = query.trim().replace(/[%,_]/g, '').slice(0, 80);
    setLoading(true);
    setLoadError('');
    const timer = setTimeout(async () => {
      try {
        let items: SearchItem[] = [];

        if (scope === 'People') {
          let request = supabase
            .from('profiles')
            .select('id, username, full_name, bio, avatar_url, created_at')
            .neq('id', me)
            .limit(30);
          if (term) request = request.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
          else request = request.order('created_at', { ascending: false });
          const { data, error } = await request;
          if (error) throw error;
          items = ((data ?? []) as unknown as Profile[]).map((profile) => ({
            id: profile.id,
            kind: 'person',
            title: profile.username || 'Lumo member',
            subtitle: profile.full_name || profile.bio || 'Lumo member',
            imageUrl: profile.avatar_url,
            route: `/user/${profile.id}`,
          }));
        } else if (scope === 'Posts' || scope === 'Videos') {
          let request = supabase.from('posts').select(POST_SELECT).order('created_at', { ascending: false }).limit(30);
          if (scope === 'Videos') request = request.or('media_type.eq.video,video_url.not.is.null');
          if (term) request = request.ilike('caption', `%${term}%`);
          const { data, error } = await request;
          if (error) throw error;
          items = ((data ?? []) as unknown as Post[]).map((post) => ({
            id: post.id,
            kind: scope === 'Videos' ? 'video' : 'post',
            title: post.profiles?.username ? `@${post.profiles.username}` : 'Lumo post',
            subtitle: post.caption?.trim() || (scope === 'Videos' ? 'Video post' : 'Post'),
            imageUrl: post.image_url || post.video_url,
            route: `/post/${post.id}`,
          }));
        } else if (scope === 'Channels') {
          const channels = await getPublicChannels(term, 30);
          items = channels.map((channel) => ({
            id: channel.id,
            kind: 'channel',
            title: channel.name,
            subtitle: channel.username ? `@${channel.username}` : channel.description || 'Public channel',
            imageUrl: channel.avatar_url,
            route: `/channels/${channel.id}`,
          }));
        } else {
          let request = supabase
            .from('chat_groups')
            .select('id, name, description, avatar_url')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(30);
          if (term) request = request.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
          const { data, error } = await request;
          if (error) throw error;
          items = (data ?? []).map((group) => ({
            id: group.id,
            kind: 'group',
            title: group.name,
            subtitle: group.description || 'Public group',
            imageUrl: group.avatar_url,
            route: `/groups/${group.id}`,
          }));
        }

        if (active) setResults(items);
      } catch (error) {
        if (!active) return;
        setResults([]);
        setLoadError(error instanceof Error ? error.message : 'Search failed. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }, 240);
    return () => { active = false; clearTimeout(timer); };
  }, [query, scope, me]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DISCOVER LUMO</Text>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>People, posts and communities already available on Lumo.</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder={`Search ${scope.toLowerCase()}`}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={`Search ${scope.toLowerCase()}`}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeList}>
        {scopes.map((item) => {
          const selected = scope === item;
          return (
            <Pressable key={item} style={[styles.scopeButton, selected && styles.scopeButtonSelected]} onPress={() => setScope(item)} accessibilityRole="tab" accessibilityState={{ selected }}>
              <Text style={[styles.scopeText, selected && styles.scopeTextSelected]}>{item}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.resultsHeading}>
        <Text style={styles.resultsTitle}>{query.trim() ? `Results for “${query.trim()}”` : scope === 'People' ? 'New on Lumo' : `Recent ${scope.toLowerCase()}`}</Text>
        <Text style={styles.resultsCount}>{loading ? ' ' : results.length}</Text>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator color={colors.accent} /><Text style={styles.stateText}>Searching…</Text></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(item.route as never)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
            >
              {item.kind === 'person' || item.kind === 'channel' || item.kind === 'group' ? (
                <Avatar uri={item.imageUrl} name={item.title} size={46} />
              ) : (
                <View style={styles.thumbnailWrap}>
                  {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} contentFit="cover" /> : <Ionicons name={item.kind === 'video' ? 'videocam-outline' : 'image-outline'} size={20} color={colors.muted} />}
                </View>
              )}
              <View style={styles.rowCopy}>
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.itemSubtitle} numberOfLines={2}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.dim} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="search-outline" size={22} color={colors.muted} /></View>
              <Text style={styles.emptyTitle}>{loadError ? 'Search unavailable' : `No ${scope.toLowerCase()} found`}</Text>
              <Text style={styles.stateText}>{loadError || 'Try a different keyword or switch the search category.'}</Text>
            </View>
          }
        />
      )}

      <Text style={styles.footerNote}>Events, products, chat files and mini-app listings will become searchable when those backend modules are connected.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 12 },
  header: { paddingHorizontal: 18, paddingBottom: 13, gap: 5 },
  eyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  searchWrap: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, paddingHorizontal: 14, borderRadius: 15, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, minWidth: 0, color: colors.text, paddingVertical: 10, fontSize: 16 },
  scopeList: { gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
  scopeButton: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  scopeButtonSelected: { borderColor: colors.glassBorder, backgroundColor: colors.surfaceSoft },
  scopeText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  scopeTextSelected: { color: colors.text, fontWeight: '800' },
  resultsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 6 },
  resultsTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  resultsCount: { color: colors.dim, fontSize: 11, fontWeight: '700' },
  listContent: { paddingHorizontal: 12, paddingBottom: 20, gap: 7 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rowPressed: { backgroundColor: colors.surfaceRaised },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  itemTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  itemSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  thumbnailWrap: { width: 46, height: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: '100%', height: '100%' },
  state: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 9 },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 22 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 42, gap: 9 },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  footerNote: { color: colors.dim, fontSize: 10.5, lineHeight: 16, paddingHorizontal: 18, paddingVertical: 10 },
});
