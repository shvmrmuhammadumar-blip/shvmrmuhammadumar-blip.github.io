import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../components/studio/StudioFrame';
import { StudioChip, StudioEmpty, StudioSection } from '../../components/studio/StudioWidgets';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { useStudioStyles } from "../../lib/theme-styles";

type ContentFilter = 'all' | 'photos' | 'videos' | 'stories';
type PostRow = { id: string; caption: string | null; media_type: string; created_at: string; image_url: string | null; video_url: string | null };
type StoryRow = { id: string; image_url: string; created_at: string };

const filters: { key: ContentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
  { key: 'stories', label: 'Stories' },
];

export default function StudioContentScreen() {
  const lumoStyles = useStudioStyles(styles);
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const [postsResult, storiesResult] = await Promise.all([
      supabase.from('posts')
        .select('id, caption, media_type, created_at, image_url, video_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('stories')
        .select('id, image_url, created_at')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    if (postsResult.error) throw postsResult.error;
    if (storiesResult.error) throw storiesResult.error;
    setPosts((postsResult.data ?? []) as PostRow[]);
    setStories((storiesResult.data ?? []) as StoryRow[]);
    setError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Content could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  const visiblePosts = useMemo(() => posts.filter((post) => {
    if (filter === 'photos') return post.media_type !== 'video' && !post.video_url;
    if (filter === 'videos') return post.media_type === 'video' || Boolean(post.video_url);
    return filter === 'stories' ? false : true;
  }), [posts, filter]);

  const total = filter === 'stories' ? stories.length : filter === 'all' ? posts.length + stories.length : visiblePosts.length;

  return (
    <StudioFrame title="Content" subtitle="Published library" icon="images-outline">
      <View style={lumoStyles.headerRow}>
        <View style={lumoStyles.headingCopy}>
          <Text style={lumoStyles.heading}>Content library</Text>
          <Text style={lumoStyles.subheading}>{posts.length} posts · {stories.length} active stories</Text>
        </View>
        <Pressable onPress={() => router.push('/create')} style={lumoStyles.createButton} accessibilityRole="button">
          <Ionicons name="add" size={17} color={colors.bg} />
          <Text style={lumoStyles.createText}>Create</Text>
        </Pressable>
      </View>

      <View style={lumoStyles.filters}>
        {filters.map((item) => <StudioChip key={item.key} label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />)}
      </View>

      {error ? <Text style={lumoStyles.error}>{error}</Text> : null}
      {loading ? <View style={lumoStyles.loading}><ActivityIndicator color={colors.accentStrong} /></View> : null}

      <StudioPanel style={lumoStyles.summaryPanel}>
        <Text style={lumoStyles.summaryLabel}>IN THIS LIBRARY</Text>
        <Text style={lumoStyles.summaryValue}>{total.toLocaleString()}</Text>
        <Text style={lumoStyles.summaryNote}>{filter === 'stories' ? 'Active stories · 24 hours' : filter === 'all' ? 'Published posts and active stories' : filter === 'videos' ? 'Video posts' : 'Photo posts'}</Text>
      </StudioPanel>

      <StudioSection title={filter === 'stories' ? 'Active stories' : 'Published posts'} />
      {filter === 'stories' ? (
        stories.length ? (
          <View style={lumoStyles.contentList}>
            {stories.map((story) => (
              <Pressable key={story.id} onPress={() => router.push(`/story/${userId}`)} style={lumoStyles.contentRow} accessibilityRole="button">
                <Image source={{ uri: story.image_url }} style={lumoStyles.thumbnail} contentFit="cover" />
                <View style={lumoStyles.contentCopy}>
                  <Text style={lumoStyles.contentTitle}>Story</Text>
                  <Text style={lumoStyles.contentMeta}>Active · {new Date(story.created_at).toLocaleString()}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            ))}
          </View>
        ) : <StudioEmpty icon="time-outline" title="No active stories" action="Create a post" onAction={() => router.push('/create')} />
      ) : visiblePosts.length ? (
        <View style={lumoStyles.contentList}>
          {visiblePosts.map((post) => {
            const video = post.media_type === 'video' || Boolean(post.video_url);
            const imageUrl = post.image_url;
            return (
              <Pressable key={post.id} onPress={() => router.push(video ? `/creator-studio/video/${post.id}` : `/post/${post.id}`)} style={lumoStyles.contentRow} accessibilityRole="button">
                {imageUrl ? <Image source={{ uri: imageUrl }} style={lumoStyles.thumbnail} contentFit="cover" /> : (
                  <View style={lumoStyles.thumbnailFallback}><Ionicons name={video ? 'play' : 'image-outline'} size={18} color={colors.muted} /></View>
                )}
                <View style={lumoStyles.contentCopy}>
                  <Text style={lumoStyles.contentTitle} numberOfLines={1}>{post.caption?.trim() || (video ? 'Video post' : 'Photo post')}</Text>
                  <Text style={lumoStyles.contentMeta}>{video ? 'VIDEO' : 'PHOTO'}  ·  {new Date(post.created_at).toLocaleDateString()}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <StudioEmpty icon="images-outline" title="Nothing in this view yet" action="Create content" onAction={() => router.push('/create')} />
      )}
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  headingCopy: { flex: 1, minWidth: 0, gap: 4 },
  heading: { color: colors.text, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 12 },
  createButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, borderRadius: 11, backgroundColor: colors.accent },
  createText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  error: { color: colors.danger, fontSize: 11 },
  loading: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  summaryPanel: { padding: 16, gap: 4 },
  summaryLabel: { color: colors.dim, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.3 },
  summaryValue: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.9 },
  summaryNote: { color: colors.muted, fontSize: 11 },
  contentList: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  contentRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  thumbnail: { width: 50, height: 50, borderRadius: 11, backgroundColor: colors.surfaceRaised },
  thumbnailFallback: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.surfaceRaised },
  contentCopy: { flex: 1, minWidth: 0, gap: 5 },
  contentTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  contentMeta: { color: colors.dim, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
});
