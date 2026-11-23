import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PostCard from '../../components/PostCard';
import UniversalForwardModal from '../../components/UniversalForwardModal';
import type { ForwardSource } from '../../components/UniversalForwardModal';
import { LumoModulePage, LumoPanel } from '../../components/LumoModulePage';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { POST_SELECT, setLike, toggleLikeLocally } from '../../lib/api';
import { colors } from '../../lib/theme';
import type { Post } from '../../lib/types';
import { useThemedStyles } from "../../lib/theme-styles";

type VideoFilter = 'For You' | 'Following' | 'Latest';

export default function VideoScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const me = session?.user?.id ?? '';
  const router = useRouter();
  const [filter, setFilter] = useState<VideoFilter>('For You');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);

  const load = useCallback(async () => {
    let followedIds: string[] = [];
    if (filter === 'Following') {
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', me);
      if (followsError) throw followsError;
      followedIds = (follows ?? []).map((row) => row.following_id);
      if (!followedIds.length) {
        setPosts([]);
        setErrorText('Follow people to see their videos here.');
        return;
      }
    }

    let request = supabase
      .from('posts')
      .select(POST_SELECT)
      .or('media_type.eq.video,video_url.not.is.null')
      .order('created_at', { ascending: false })
      .limit(60);

    if (filter === 'Following') request = request.in('user_id', followedIds);
    const { data, error } = await request;
    if (error) throw error;
    setPosts((data as unknown as Post[]) ?? []);
    setErrorText('');
  }, [filter, me]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      load()
        .catch((error: unknown) => {
          if (!active) return;
          setPosts([]);
          setErrorText(error instanceof Error ? error.message : 'Could not load videos.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); }
    catch (error) { setErrorText(error instanceof Error ? error.message : 'Could not refresh videos.'); }
    finally { setRefreshing(false); }
  };

  const handleLike = (post: Post) => {
    const liked = (post.likes ?? []).some((item) => item.user_id === me);
    setPosts((current) => current.map((item) => item.id === post.id ? toggleLikeLocally(item, me) : item));
    void setLike(post.id, me, !liked).catch(() => void load());
  };

  const handleShare = (post: Post) => {
    setForwardSource({
      type: 'post',
      id: post.id,
      senderLabel: post.profiles?.username ?? 'user',
      chatLabel: 'Lumo video',
      body: post.caption ?? null,
      messageType: 'video',
      mediaPath: post.media_path ?? null,
      mediaMimeType: post.media_mime_type ?? null,
      mediaFileName: post.media_file_name ?? post.media_path?.split('/').pop() ?? null,
    });
  };

  return (
    <LumoModulePage
      eyebrow="Lumo / Watch"
      title="Video"
      description="Short clips and videos shared by people on Lumo. Your feed is ordered by recent posts until personalized recommendations are available."
      iconName="play-circle-outline"
    >
      <LumoPanel style={lumoStyles.filterPanel}>
        {(['For You', 'Following', 'Latest'] as VideoFilter[]).map((item) => {
          const selected = filter === item;
          return (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[lumoStyles.filterButton, selected && lumoStyles.filterButtonSelected]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[lumoStyles.filterText, selected && lumoStyles.filterTextSelected]}>{item}</Text>
            </Pressable>
          );
        })}
      </LumoPanel>

      {filter === 'For You' ? (
        <Text style={lumoStyles.helperText}>Recommendation signals are not connected yet; recent videos are shown instead.</Text>
      ) : null}

      {loading ? (
        <View style={lumoStyles.state}><ActivityIndicator color={colors.accent} /><Text style={lumoStyles.stateText}>Loading videos…</Text></View>
      ) : posts.length ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          contentContainerStyle={lumoStyles.list}
          renderItem={({ item, index }) => (
            <PostCard
              post={item}
              myId={me}
              onLike={handleLike}
              onOpenComments={(post) => router.push(`/post/${post.id}`)}
              onOpenUser={(userId) => router.push(`/user/${userId}`)}
              onShare={handleShare}
              onOpenVideo={(post) => router.push(`/post-viewer/${post.id}`)}
              autoPlayVideo={false}
            />
          )}
        />
      ) : (
        <LumoPanel style={lumoStyles.emptyPanel}>
          <View style={lumoStyles.emptyIcon}><Ionicons name="videocam-outline" size={26} color={colors.muted} /></View>
          <Text style={lumoStyles.emptyTitle}>{filter === 'Following' ? 'No videos from followed accounts' : 'No videos yet'}</Text>
          <Text style={lumoStyles.stateText}>{errorText || 'Published video posts will appear here.'}</Text>
          <Pressable style={lumoStyles.primaryButton} onPress={() => router.push('/create')} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.bg} /><Text style={lumoStyles.primaryButtonText}>Create a video post</Text>
          </Pressable>
        </LumoPanel>
      )}

      <UniversalForwardModal
        visible={!!forwardSource}
        userId={me}
        source={forwardSource}
        onClose={() => setForwardSource(null)}
        onSuccess={() => { setForwardSource(null); void load(); }}
      />
    </LumoModulePage>
  );
}

const styles = StyleSheet.create({
  filterPanel: { flexDirection: 'row', gap: 7, padding: 6 },
  filterButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  filterButtonSelected: { backgroundColor: colors.surfaceSoft },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: colors.text },
  helperText: { color: colors.dim, fontSize: 12, lineHeight: 18, marginTop: -10 },
  list: { gap: 12 },
  state: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 10 },
  stateText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  emptyPanel: { alignItems: 'center', gap: 11, paddingVertical: 30 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  primaryButton: { minHeight: 43, borderRadius: 13, backgroundColor: colors.accent, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  primaryButtonText: { color: colors.bg, fontSize: 13, fontWeight: '800' },
});
