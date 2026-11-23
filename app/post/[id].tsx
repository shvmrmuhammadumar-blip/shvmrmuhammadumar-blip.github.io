import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../lib/alert';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import PostCard from '../../components/PostCard';
import UniversalForwardModal from '../../components/UniversalForwardModal';
import type { ForwardSource } from '../../components/UniversalForwardModal';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { POST_SELECT, setLike, timeAgo, toggleLikeLocally } from '../../lib/api';
import { trackContentOpen } from '../../lib/studio-analytics';
import { colors } from '../../lib/theme';
import type { Comment, Post } from '../../lib/types';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


export default function PostScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const [deleteCommentError, setDeleteCommentError] = useState('');
  const [postDeleteVisible, setPostDeleteVisible] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [postDeleteError, setPostDeleteError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forwardSource, setForwardSource] = useState<ForwardSource | null>(null);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const load = useCallback(async (stillActive: () => boolean = () => true) => {
    const [postResult, commentsResult, savedResult] = await Promise.all([
      supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('comments')
        .select('id, post_id, user_id, body, created_at, profiles(username, avatar_url)')
        .eq('post_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('saved_post')
        .select('post_id')
        .eq('post_id', id)
        .eq('user_id', me)
        .maybeSingle(),
    ]);
    if (postResult.error) throw postResult.error;
    if (commentsResult.error) throw commentsResult.error;
    if (!stillActive()) return;
    const loadedPost = (postResult.data as unknown as Post | null) ?? null;
    setPost(loadedPost);
    if (loadedPost && loadedPost.media_type !== 'video' && !loadedPost.video_url) {
      void trackContentOpen({
        ownerId: loadedPost.user_id,
        viewerId: me,
        contentId: loadedPost.id,
        contentType: 'post',
      });
    }
    setComments((commentsResult.data as unknown as Comment[]) ?? []);
    setIsSaved(!!savedResult.data);
    setLoadError('');
  }, [id, me]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void load(() => active)
        .catch((error: unknown) => {
          if (active) setLoadError(error instanceof Error ? error.message : 'Could not load this post.');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [load])
  );

  const onLike = (target: Post) => {
    const liked = (target.likes ?? []).some((l) => l.user_id === me);
    setPost((prev) => (prev ? toggleLikeLocally(prev, me) : prev));
    setLike(target.id, me, !liked).catch(() => load());
  };

  const onSave = async () => {
    if (!post) return;
    const nextSaved = !isSaved;
    setIsSaved(nextSaved);
    try {
      if (nextSaved) {
        const { error } = await supabase.from('saved_post').insert({ post_id: post.id, user_id: me });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('saved_post').delete().eq('post_id', post.id).eq('user_id', me);
        if (error) throw error;
      }
    } catch (error) {
      setIsSaved(!nextSaved);
      Alert.alert('Could not update saved post', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const onSharePost = (target: Post) => {
    const isVideo = target.media_type === 'video' || Boolean(target.video_url);
    setForwardSource({
      type: 'post',
      id: target.id,
      senderLabel: target.profiles?.username ?? 'user',
      chatLabel: 'Lumo post',
      body: target.caption ?? null,
      messageType: isVideo ? 'video' : 'image',
      mediaPath: target.media_path ?? null,
      mediaMimeType: target.media_mime_type ?? null,
      mediaFileName: target.media_file_name ?? target.media_path?.split('/').pop() ?? null,
    });
  };
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from('comments').insert({ post_id: id, user_id: me, body });
      if (error) throw error;
      setText('');
      await load();
    } catch (error) {
      Alert.alert('Could not comment', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const remove = (comment: Comment) => {
    const canDelete = comment.user_id === me || post?.user_id === me;
    if (!canDelete) return;
    setDeleteCommentError('');
    setCommentToDelete(comment);
  };

  const confirmDeleteComment = async () => {
    if (!commentToDelete || deletingCommentId) return;
    setDeletingCommentId(commentToDelete.id);

    try {
      const { data, error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentToDelete.id)
        .eq('post_id', commentToDelete.post_id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('The comment could not be deleted.');

      setComments((current) => current.filter((item) => item.id !== commentToDelete.id));
      setPost((current) => {
        if (!current || typeof current.comments?.[0]?.count !== 'number') return current;
        return {
          ...current,
          comments: [{ count: Math.max(0, current.comments[0].count - 1) }],
        };
      });
      setCommentToDelete(null);
    } catch (error) {
      setDeleteCommentError(
        error instanceof Error ? error.message : 'The comment could not be deleted. Please try again.'
      );
    } finally {
      setDeletingCommentId(null);
    }
  };

  const deletePost = () => {
    setPostDeleteError('');
    setPostDeleteVisible(true);
  };

  const confirmDeletePost = async () => {
    if (deletingPost) return;
    setDeletingPost(true);

    try {
      const { data, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Postni o‘chirib bo‘lmadi. Qayta urinib ko‘ring.');

      setPostDeleteVisible(false);
      goBack();
    } catch (error) {
      setPostDeleteError(
        error instanceof Error ? error.message : 'Postni o‘chirib bo‘lmadi. Qayta urinib ko‘ring.'
      );
    } finally {
      setDeletingPost(false);
    }
  };

  if (loading) {
    return (
      <View style={lumoStyles.screen}>
        <ScreenHeader onBack={goBack} />
        <View style={lumoStyles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </View>
    );
  }
  if (!post) {
    return (
      <View style={lumoStyles.screen}>
        <ScreenHeader onBack={goBack} />
        <View style={lumoStyles.center}>
          <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>
            {loadError ? 'Could not load this post' : 'This post is no longer available.'}
          </Text>
          {!!loadError && <Text style={{ color: colors.muted, textAlign: 'center', lineHeight: 20 }}>{loadError}</Text>}
          {!!loadError && (
            <Pressable
              onPress={() => {
                setLoading(true);
                void load().catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Please try again.'))
                  .finally(() => setLoading(false));
              }}
              style={lumoStyles.retryButton}
              accessibilityRole="button"
            >
              <Text style={lumoStyles.retryButtonText}>Try again</Text>
            </Pressable>
          )}
          <Pressable onPress={goBack} style={{ padding: 12 }} accessibilityRole="button">
            <Text style={{ color: colors.lime, fontWeight: '700' }}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView style={lumoStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScreenHeader onBack={goBack} />
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            <View>
              <PostCard
                post={post}
                myId={me}
                onLike={onLike}
                onOpenComments={() => {}}
                onOpenUser={(uid) => router.push(uid === me ? '/profile' : `/user/${uid}`)}
                isSaved={isSaved}
                onSave={onSave}
                onDeletePost={deletePost}
                onShare={onSharePost}
              />
              {post.user_id === me && (
                <Pressable onPress={deletePost} style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <Text style={{ color: colors.like, fontWeight: '600' }}>Delete post</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={lumoStyles.comment}>
              <Avatar uri={item.profiles?.avatar_url} name={item.profiles?.username} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '700' }}>{item.profiles?.username ?? 'user'} </Text>
                  {item.body}
                </Text>
                <Text style={lumoStyles.time}>{timeAgo(item.created_at)} ago</Text>
              </View>
              {(item.user_id === me || post.user_id === me) && (
                <Pressable
                  onPress={() => remove(item)}
                  disabled={deletingCommentId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete comment by ${item.profiles?.username ?? 'user'}`}
                  hitSlop={8}
                  style={lumoStyles.deleteComment}
                >
                  <Text style={[lumoStyles.deleteCommentText, deletingCommentId === item.id && { opacity: 0.5 }]}>
                    Delete
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        />
        <View style={lumoStyles.inputRow}>
          <TextInput
            style={lumoStyles.input}
            placeholder="Add a comment…"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            maxLength={1000}
          />
          <Pressable onPress={send} disabled={!text.trim() || sending}>
            <Text style={[lumoStyles.post, (!text.trim() || sending) && { opacity: 0.4 }]}>Post</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={commentToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingCommentId) setCommentToDelete(null);
        }}
      >
        <View style={lumoStyles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Cancel delete"
            onPress={() => {
              if (!deletingCommentId) setCommentToDelete(null);
            }}
          />
          <View style={lumoStyles.confirmDialog} accessibilityViewIsModal>
            <View style={lumoStyles.deleteIcon}>
              <Ionicons name="trash-outline" size={22} color={colors.like} />
            </View>
            <Text style={lumoStyles.confirmEyebrow}>CONFIRM ACTION</Text>
            <Text style={lumoStyles.confirmTitle}>Delete this comment?</Text>
            <Text style={lumoStyles.confirmMessage}>
              This comment will be permanently removed.
            </Text>
            {!!deleteCommentError && (
              <Text style={lumoStyles.confirmError}>{deleteCommentError}</Text>
            )}
            <View style={lumoStyles.confirmActions}>
              <Pressable
                onPress={() => setCommentToDelete(null)}
                disabled={!!deletingCommentId}
                style={lumoStyles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={lumoStyles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmDeleteComment()}
                disabled={!!deletingCommentId}
                style={lumoStyles.confirmDeleteButton}
                accessibilityRole="button"
              >
                {deletingCommentId ? (
                  <ActivityIndicator color={colors.inverseText} size="small" />
                ) : (
                  <Text style={lumoStyles.confirmDeleteText}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={postDeleteVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingPost) setPostDeleteVisible(false);
        }}
      >
        <View style={lumoStyles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="O‘chirishni bekor qilish"
            onPress={() => {
              if (!deletingPost) setPostDeleteVisible(false);
            }}
          />
          <View style={lumoStyles.confirmDialog} accessibilityViewIsModal>
            <View style={lumoStyles.deleteIcon}>
              <Ionicons name="trash-outline" size={22} color={colors.like} />
            </View>
            <Text style={lumoStyles.confirmEyebrow}>TASDIQLASH</Text>
            <Text style={lumoStyles.confirmTitle}>Postni o‘chirmoqchimisiz?</Text>
            <Text style={lumoStyles.confirmMessage}>
              Post butunlay o‘chiriladi. Bu amalni ortga qaytarib bo‘lmaydi.
            </Text>
            {!!postDeleteError && (
              <Text style={lumoStyles.confirmError}>{postDeleteError}</Text>
            )}
            <View style={lumoStyles.confirmActions}>
              <Pressable
                onPress={() => setPostDeleteVisible(false)}
                disabled={deletingPost}
                style={lumoStyles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={lumoStyles.cancelButtonText}>Bekor qilish</Text>
              </Pressable>
              <Pressable
                onPress={() => void confirmDeletePost()}
                disabled={deletingPost}
                style={lumoStyles.confirmDeleteButton}
                accessibilityRole="button"
              >
                {deletingPost ? (
                  <ActivityIndicator color={colors.inverseText} size="small" />
                ) : (
                  <Text style={lumoStyles.confirmDeleteText}>O‘chirish</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <UniversalForwardModal visible={!!forwardSource} userId={me} source={forwardSource} onClose={() => setForwardSource(null)} onSuccess={() => setForwardSource(null)} />
    </>
  );
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.header}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={lumoStyles.backButton}
      >
        <Ionicons name="arrow-back" size={21} color={colors.text} />
      </Pressable>
      <Text style={lumoStyles.headerTitle}>Post</Text>
      <View style={lumoStyles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24, gap: 12 },
  retryButton: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.lime, justifyContent: 'center' },
  retryButtonText: { color: colors.bg, fontWeight: '800' },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '700' },
  headerSpacer: { width: 40 },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  deleteComment: { alignSelf: 'flex-start', paddingVertical: 4, paddingLeft: 4 },
  deleteCommentText: { color: colors.like, fontSize: 13, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  confirmDialog: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  deleteIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 111, 145, 0.12)',
    marginBottom: 18,
  },
  confirmEyebrow: { color: colors.like, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  confirmTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 8 },
  confirmMessage: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  confirmError: { color: colors.like, fontSize: 13, lineHeight: 19, marginTop: 12 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 24 },
  cancelButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  confirmDeleteButton: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.like,
  },
  confirmDeleteText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  time: { color: colors.muted, fontSize: 12, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, color: colors.text },
  post: { color: colors.accent, fontWeight: '700', fontSize: 16 },
});
