import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { ViewToken } from 'react-native';
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

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  if (typeof error === 'string') return error;
  return 'Could not load your feed. Please try again.';
}

export default function Feed() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 55,
    minimumViewTime: 250,
  }).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems, changed }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      changed.forEach(({ item, isViewable }) => {
        if (!isViewable) return;
        const post = item as Post;
        const isVideo = post.media_type === "video" || Boolean(post.video_url);
        if (isVideo) return;

        void trackContentOpen({
          ownerId: post.user_id,
          viewerId: me,
          contentId: post.id,
          contentType: 'post',
        });
      });

    },
  ).current;

  const load = useCallback(async () => {
    const [{ data: follows, error: followsError }, { data: savedRows, error: savedError }] =
      await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', me),
        supabase.from('saved_post').select('post_id').eq('user_id', me),
      ]);

    if (followsError) throw followsError;
    if (!savedError && savedRows) {
      setSavedPostIds(new Set(savedRows.map((r: { post_id: string }) => r.post_id)));
    }

    const ids = [
      ...new Set([me, ...(follows ?? []).map((follow) => follow.following_id)]),
    ];
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);

    if (error) throw error;

    setPosts((data as unknown as Post[]) ?? []);
    setLoadError('');
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load()
        .catch((error: unknown) => {
          setLoadError(getErrorMessage(error));
        })
        .finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const onLike = (post: Post) => {
    const liked = (post.likes ?? []).some((l) => l.user_id === me);
    setPosts((prev) => prev.map((p) => (p.id === post.id ? toggleLikeLocally(p, me) : p)));
    setLike(post.id, me, !liked).catch(() => load());
  };

  const onSave = async (post: Post) => {
    const alreadySaved = savedPostIds.has(post.id);
    setSavedPostIds((prev) => {
      const next = new Set(prev);
      if (alreadySaved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });

    try {
      if (alreadySaved) {
        const { error } = await supabase
          .from('saved_post')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', me);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_post')
          .insert({ post_id: post.id, user_id: me });
        if (error) throw error;
      }
    } catch (error) {
      setSavedPostIds((prev) => {
        const next = new Set(prev);
        if (alreadySaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      Alert.alert(
        'Could not update bookmark',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const onSharePost = (post: Post) => {
    const isVideo = post.media_type === 'video' || Boolean(post.video_url);
    setForwardSource({
      type: 'post',
      id: post.id,
      senderLabel: post.profiles?.username ?? 'user',
      chatLabel: 'Lumo post',
      body: post.caption ?? null,
      messageType: isVideo ? 'video' : 'image',
      mediaPath: post.media_path ?? null,
      mediaMimeType: post.media_mime_type ?? null,
      mediaFileName: post.media_file_name ?? post.media_path?.split('/').pop() ?? null,
    });
  };
  const onDeletePost = (post: Post) => {
    Alert.alert('Delete this post?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('posts').delete().eq('id', post.id);
            if (error) throw error;
            setPosts((prev) => prev.filter((p) => p.id !== post.id));
          } catch (err) {
            Alert.alert('Could not delete', err instanceof Error ? err.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.lime} size="small" />
      </View>
    );
  }

  return (
    <>
      <FlatList
      data={[]}
      keyExtractor={(p) => p.id}
      viewabilityConfig={viewabilityConfig}
      onViewableItemsChanged={onViewableItemsChanged}
      ListHeaderComponent={
        <View style={styles.feedHeader}>
          <StoriesBar />
        </View>
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          autoPlayVideo={false}
          myId={me}
          onLike={onLike}
          onOpenComments={(p) => router.push(`/post/${p.id}`)}
          onOpenUser={(id) =>
            router.push(id === me ? '/profile' : `/user/${id}`)
          }
          isSaved={savedPostIds.has(item.id)}
          onSave={onSave}
          onDeletePost={onDeletePost}
          onShare={onSharePost}
          onOpenVideo={(p) => router.push(("/post-viewer/" + p.id) as any)}
        />
      )}
      ListEmptyComponent={loadError ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Feed unavailable</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Your feed is empty</Text>
          <Text style={styles.emptyText}>Share your first photo from the + tab, or find people to follow in Search.</Text>
        </View>
      )}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.lime} colors={[colors.lime]} />}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
      <UniversalForwardModal visible={!!forwardSource} userId={me} source={forwardSource} onClose={() => setForwardSource(null)} onSuccess={() => setForwardSource(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  listContent: { paddingBottom: 24 },
  feedHeader: { paddingTop: 8, paddingBottom: 6 },
  storiesTitle: { color: colors.text, fontSize: 20, fontWeight: '800', paddingHorizontal: 16, paddingBottom: 8 },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptyText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
