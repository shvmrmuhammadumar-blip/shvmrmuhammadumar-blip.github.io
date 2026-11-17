import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { StudioFrame, StudioPanel } from '../../../components/studio/StudioFrame';
import { StudioEmpty, StudioSection } from '../../../components/studio/StudioWidgets';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string | null;
  created_at: string;
  person: { id: string; username: string | null; avatar_url: string | null } | null;
};

export default function StudioCommunityScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const router = useRouter();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    const postsResult = await supabase.from('posts').select('id').eq('user_id', userId).limit(1000);
    if (postsResult.error) throw postsResult.error;
    const postIds = (postsResult.data ?? []).map((post) => post.id);
    if (!postIds.length) {
      setComments([]);
      setError('');
      return;
    }
    const commentsResult = await supabase.from('comments')
      .select('id, post_id, user_id, body, created_at, person:profiles!comments_user_id_fkey(id, username, avatar_url)')
      .in('post_id', postIds)
      .order('created_at', { ascending: false })
      .limit(40);
    if (commentsResult.error) throw commentsResult.error;
    setComments((commentsResult.data ?? []) as unknown as CommentRow[]);
    setError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    load().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Community could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]));

  return (
    <StudioFrame title="Community" subtitle="Conversations around your content" icon="chatbubbles-outline">
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.heading}>Community</Text>
          <Text style={styles.subheading}>Stay close to your audience.</Text>
        </View>
        <Pressable onPress={() => router.push('/messages')} style={styles.inboxButton} accessibilityRole="button">
          <Ionicons name="mail-outline" size={16} color={colors.bg} />
          <Text style={styles.inboxText}>Open inbox</Text>
        </Pressable>
      </View>

      <View style={styles.shortcutGrid}>
        <Pressable style={styles.shortcut} onPress={() => router.push('/messages')} accessibilityRole="button">
          <View style={styles.shortcutIcon}><Ionicons name="chatbubbles-outline" size={20} color={colors.accentStrong} /></View>
          <Text style={styles.shortcutTitle}>Messages</Text>
          <Text style={styles.shortcutMeta}>Direct conversations</Text>
        </Pressable>
        <Pressable style={styles.shortcut} onPress={() => router.push('/studio/audience')} accessibilityRole="button">
          <View style={styles.shortcutIcon}><Ionicons name="people-outline" size={20} color={colors.accentStrong} /></View>
          <Text style={styles.shortcutTitle}>Audience</Text>
          <Text style={styles.shortcutMeta}>Followers & following</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <StudioSection title="Recent comments" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.accentStrong} style={{ marginVertical: 22 }} /> : null}
        {!loading && comments.length ? (
          <StudioPanel style={styles.commentPanel}>
            {comments.map((comment) => (
              <Pressable key={comment.id} onPress={() => router.push(`/post/${comment.post_id}`)} style={styles.commentRow} accessibilityRole="button">
                {comment.person?.avatar_url ? <Image source={{ uri: comment.person.avatar_url }} style={styles.avatar} /> : (
                  <View style={styles.avatarFallback}><Ionicons name="person" size={15} color={colors.muted} /></View>
                )}
                <View style={styles.commentCopy}>
                  <View style={styles.commentTop}>
                    <Text style={styles.username}>@{comment.person?.username ?? 'user'}</Text>
                    <Text style={styles.date}>{new Date(comment.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Text style={styles.commentText} numberOfLines={2}>{comment.body?.trim() || 'Media comment'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={15} color={colors.dim} />
              </Pressable>
            ))}
          </StudioPanel>
        ) : null}
        {!loading && !comments.length ? <StudioEmpty icon="chatbubble-ellipses-outline" title="No comments yet" action="View content" onAction={() => router.push('/studio/content')} /> : null}
      </View>
    </StudioFrame>
  );
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, gap: 4 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  subheading: { color: colors.muted, fontSize: 11 },
  inboxButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.accent },
  inboxText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  shortcutGrid: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  shortcut: { flexGrow: 1, flexBasis: 190, minHeight: 118, gap: 7, padding: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16 },
  shortcutIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 11 },
  shortcutTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  shortcutMeta: { color: colors.muted, fontSize: 10 },
  section: { gap: 10 },
  error: { color: colors.danger, fontSize: 11 },
  commentPanel: { paddingHorizontal: 10, paddingVertical: 3 },
  commentRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceRaised },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  commentCopy: { flex: 1, minWidth: 0, gap: 5 },
  commentTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  username: { color: colors.text, fontSize: 10, fontWeight: '800' },
  date: { color: colors.dim, fontSize: 9 },
  commentText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
});
