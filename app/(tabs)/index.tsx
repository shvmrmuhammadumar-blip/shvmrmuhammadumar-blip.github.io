import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { ViewToken } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import PostCard from '../../components/PostCard';
import UniversalForwardModal from '../../components/UniversalForwardModal';
import type { ForwardSource } from '../../components/UniversalForwardModal';
import StoriesBar from '../../components/StoriesBar';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { POST_SELECT, setLike, toggleLikeLocally } from '../../lib/api';
import { trackContentOpen } from '../../lib/studio-analytics';
import { colors } from '../../lib/theme';
import type { Post } from '../../lib/types';

type FeedFilter = 'for-you' | 'following';

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  if (typeof error === 'string') return error;
  return 'Could not load your feed. Please try again.';
}

export default function Feed() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FeedFilter>('for-you');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55, minimumViewTime: 250 }).current;
  const onViewableItemsChanged = useRef(
    ({ changed }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      changed.forEach(({ item, isViewable }) => {
        if (!isViewable) return;
        const post = item as Post;
        if (post.media_type === 'video' || post.video_url) return;
        void trackContentOpen({ ownerId: post.user_id, viewerId: me, contentId: post.id, contentType: 'post' });
      });
    },
  ).current;

  const load = useCallback(async () => {
    const [{ data: follows, error: followsError }, { data: savedRows, error: savedError }] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', me),
      supabase.from('saved_post').select('post_id').eq('user_id', me),
    ]);
    if (followsError) throw followsError;
    if (!savedError && savedRows) setSavedPostIds(new Set(savedRows.map((row: { post_id: string }) => row.post_id)));

    let request = supabase.from('posts').select(POST_SELECT)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
    if (filter === 'following') {
      const ids = [...new Set([me, ...(follows ?? []).map((follow) => follow.following_id)])];
      request = request.in('user_id', ids);
    }
    const { data, error } = await request;
    if (error) throw error;
    setPosts((data as unknown as Post[]) ?? []);
    setLoadError('');
  }, [filter, me]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((error: unknown) => {
      if (active) setLoadError(getErrorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try { await load(); }
    catch (error) { setLoadError(getErrorMessage(error)); }
    finally { setRefreshing(false); }
  };

  const onLike = (post: Post) => {
    const liked = (post.likes ?? []).some((like) => like.user_id === me);
    setPosts((prev) => prev.map((item) => item.id === post.id ? toggleLikeLocally(item, me) : item));
    setLike(post.id, me, !liked).catch(() => load());
  };

  const onSave = async (post: Post) => {
    const alreadySaved = savedPostIds.has(post.id);
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(post.id); else next.add(post.id);
      return next;
    });
    try {
      if (alreadySaved) {
        const { error } = await supabase.from('saved_post').delete().eq('post_id', post.id).eq('user_id', me);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('saved_post').insert({ post_id: post.id, user_id: me });
        if (error) throw error;
      }
    } catch (error) {
      setSavedPostIds((prev) => {
        const next = new Set(prev);
        if (alreadySaved) next.add(post.id); else next.delete(post.id);
        return next;
      });
      Alert.alert('Could not update bookmark', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const onSharePost = (post: Post) => {
    const isVideo = post.media_type === 'video' || Boolean(post.video_url);
    setForwardSource({
      type: 'post', id: post.id, senderLabel: post.profiles?.username ?? 'user',
      chatLabel: 'Lumo post', body: post.caption ?? null,
      messageType: isVideo ? 'video' : 'image', mediaPath: post.media_path ?? null,
      mediaMimeType: post.media_mime_type ?? null,
      mediaFileName: post.media_file_name ?? post.media_path?.split('/').pop() ?? null,
    });
  };

  const onDeletePost = (post: Post) => {
    Alert.alert('Delete this post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase.from('posts').delete().eq('id', post.id);
          if (error) throw error;
          setPosts((prev) => prev.filter((item) => item.id !== post.id));
        } catch (error) {
          Alert.alert('Could not delete', error instanceof Error ? error.message : 'Please try again.');
        }
      }},
    ]);
  };

  const header = (
    <View style={styles.feedHeader}>
      <Pressable style={styles.profileSearch} onPress={() => router.push('/search')} accessibilityRole="button" accessibilityLabel="Search profiles">
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <Text style={styles.profileSearchText}>Search people and profiles</Text>
      </Pressable>
      <StoriesBar />
      <View style={styles.filterRow}>
        <Pressable onPress={() => setFilter('for-you')} accessibilityRole="tab"
          accessibilityState={{ selected: filter === 'for-you' }}
          style={[styles.filterTab, filter === 'for-you' && styles.filterTabActive]}>
          <Ionicons name="sparkles" size={15} color={filter === 'for-you' ? colors.text : colors.muted} />
          <Text style={[styles.filterText, filter === 'for-you' && styles.filterTextActive]}>For you</Text>
        </Pressable>
        <Pressable onPress={() => setFilter('following')} accessibilityRole="tab"
          accessibilityState={{ selected: filter === 'following' }}
          style={[styles.filterTab, filter === 'following' && styles.filterTabActive]}>
          <Ionicons name="people-outline" size={16} color={filter === 'following' ? colors.text : colors.muted} />
          <Text style={[styles.filterText, filter === 'following' && styles.filterTextActive]}>Following</Text>
        </Pressable>
      </View>
    </View>
  );

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.lime} size="small" /></View>;

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(post) => post.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <PostCard post={item} autoPlayVideo={false} myId={me} onLike={onLike}
            onOpenComments={(post) => router.push('/post/' + post.id)}
            onOpenUser={(id) => router.push(id === me ? '/profile' : '/user/' + id)}
            isSaved={savedPostIds.has(item.id)} onSave={onSave} onDeletePost={onDeletePost}
            onShare={onSharePost}
            onOpenVideo={(post) => router.push(('/post-viewer/' + post.id) as any)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name={loadError ? 'cloud-offline-outline' : 'layers-outline'} size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>{loadError ? 'Feed unavailable' : filter === 'following' ? 'No posts from your circle yet' : 'Nothing new yet'}</Text>
            <Text style={styles.emptyText}>{loadError ? loadError : filter === 'following' ? 'Follow people to see their posts here.' : 'New posts from the LUMO community will appear here.'}</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.lime} colors={[colors.lime]} />}
        style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
      />
      <UniversalForwardModal visible={!!forwardSource} userId={me} source={forwardSource}
        onClose={() => setForwardSource(null)} onSuccess={() => setForwardSource(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  list: { backgroundColor: colors.bg },
  listContent: { paddingBottom: 24, flexGrow: 1 },
  feedHeader: { paddingTop: 8, paddingBottom: 4 },
  profileSearch: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  profileSearchText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, maxWidth: 960, width: '100%', alignSelf: 'center' },
  filterTab: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterTabActive: { backgroundColor: colors.surfaceRaised, borderColor: colors.accent },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  filterTextActive: { color: colors.text },
  empty: { flex: 1, paddingHorizontal: 32, paddingVertical: 52, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
});
