import UniversalForwardModal, { type ForwardSource } from "../../../components/UniversalForwardModal";
import ChatMediaViewer, { type ChatMediaViewerItem } from '../../../components/ChatMediaViewer';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../../components/Avatar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import { colors } from '../../../lib/theme';
import ChannelPostItem from '../../../components/channels/ChannelPostItem';
import { ChannelMediaUpload } from '../../../components/channels/ChannelMediaUpload';
import { supabase } from '../../../lib/supabase';
import {
  getChannel,
  getChannelPosts,
  deleteChannelPost,
  editChannelPost,
  publishChannelPost,
  subscribeToChannelPosts,
} from '../../../lib/channels';
import type { Channel, ChannelPostWithSender } from '../../../lib/channels';
import { useThemedStyles, resolveThemeColor } from "../../../lib/theme-styles";


export default function ChannelScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const feedRef = useRef<ScrollViewInstance | null>(null);

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPostWithSender[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ChannelPostWithSender | null>(null);
  const [confirmingPostDelete, setConfirmingPostDelete] = useState(false);
  const [editingSelectedPost, setEditingSelectedPost] = useState(false);
  const [postEditDraft, setPostEditDraft] = useState('');
  const [postActionLoading, setPostActionLoading] = useState(false);
  const [postActionError, setPostActionError] = useState('');
  const [universalForwardSource, setUniversalForwardSource] =
    useState<ForwardSource | null>(null);
  const [selectedChannelMedia, setSelectedChannelMedia] =
    useState<ChatMediaViewerItem | null>(null);

  const loadChannel = useCallback(async () => {
    if (!id) return;

    try {
      setError('');

      const [channelData, postData] = await Promise.all([
        getChannel(id),
        getChannelPosts(id),
      ]);

      setChannel(channelData);
      if (me) {
        const [
          { data: hiddenRows, error: hiddenError },
          { data: developerData, error: developerError },
        ] = await Promise.all([
          (supabase as any)
            .from('channel_post_hidden_for')
            .select('post_id')
            .eq('user_id', me),
          (supabase as any).rpc('is_platform_developer'),
        ]);

        if (hiddenError) throw hiddenError;
        if (developerError) throw developerError;

        const hiddenIds = new Set(
          (hiddenRows ?? []).map((row: { post_id: string }) => row.post_id),
        );

        setPosts(postData.filter((post) => !hiddenIds.has(post.id)));
        setIsDeveloper(Boolean(developerData));
      } else {
        setPosts(postData);
        setIsDeveloper(false);
      }

      if (me) {
        const { data, error: memberError } = await supabase
          .from('channel_members')
          .select('role')
          .eq('channel_id', id)
          .eq('user_id', me)
          .maybeSingle();

        if (memberError) throw memberError;

        setCanPost(
          channelData.owner_id === me ||
          data?.role === 'owner' ||
          data?.role === 'admin',
        );
      } else {
        setCanPost(false);
        setIsDeveloper(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load this channel.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, me]);

  useEffect(() => {
    if (!id) {
      setError('Channel ID is missing.');
      setLoading(false);
      return;
    }

    void loadChannel();

    const subscription = subscribeToChannelPosts(id, () => {
      void loadChannel();
    });

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [id, loadChannel]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      feedRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [posts]);

  const handlePublish = async () => {
    const body = draft.trim();

    if (!body || !me || !channel || sending) return;

    setSending(true);

    try {
      await publishChannelPost({
        channelId: channel.id,
        senderId: me,
        body,
        messageType: 'text',
      });

      setDraft('');
      await loadChannel();
    } catch (err) {
      Alert.alert(
        'Could not publish',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSending(false);
    }
  };


  const closePostActions = () => {
    if (postActionLoading) return;
    setSelectedPost(null);
    setConfirmingPostDelete(false);
    setEditingSelectedPost(false);
    setPostActionError('');
  };

  const copySelectedPost = async () => {
    if (!selectedPost?.body?.trim()) return;

    try {
      const clipboard = (globalThis as any).navigator?.clipboard;

      if (!clipboard?.writeText) {
        throw new Error('Clipboard is unavailable in this browser.');
      }

      await clipboard.writeText(selectedPost.body);
      closePostActions();
    } catch (err) {
      setPostActionError(
        err instanceof Error ? err.message : 'Could not copy post.',
      );
    }
  };

  const hideSelectedPost = async () => {
    if (!selectedPost || !me || postActionLoading) return;

    setPostActionLoading(true);
    setPostActionError('');

    try {
      const { error: hideError } = await (supabase as any)
        .from('channel_post_hidden_for')
        .upsert(
          { post_id: selectedPost.id, user_id: me },
          { onConflict: 'post_id,user_id' },
        );

      if (hideError) throw hideError;

      setPosts((current) =>
        current.filter((post) => post.id !== selectedPost.id),
      );
      closePostActions();
    } catch (err) {
      setPostActionError(
        err instanceof Error ? err.message : 'Could not hide post.',
      );
    } finally {
      setPostActionLoading(false);
    }
  };

  const deleteSelectedPost = async () => {
    if (!selectedPost || !canPost || postActionLoading) return;

    setPostActionLoading(true);
    setPostActionError('');

    try {
      await deleteChannelPost(selectedPost.id);

      setPosts((current) =>
        current.filter((post) => post.id !== selectedPost.id),
      );
      closePostActions();
    } catch (err) {
      setPostActionError(
        err instanceof Error ? err.message : 'Could not delete post.',
      );
    } finally {
      setPostActionLoading(false);
    }
  };

  const saveSelectedPostEdit = async () => {
    if (
      !selectedPost ||
      !me ||
      selectedPost.sender_id !== me ||
      !canPost ||
      selectedPost.message_type !== 'text' ||
      !postEditDraft.trim() ||
      postActionLoading
    ) return;

    setPostActionLoading(true);
    setPostActionError('');

    try {
      await editChannelPost(selectedPost.id, me, postEditDraft);

      setPosts((current) =>
        current.map((post) =>
          post.id === selectedPost.id
            ? {
                ...post,
                body: postEditDraft.trim(),
                edited_at: new Date().toISOString(),
              }
            : post,
        ),
      );

      closePostActions();
    } catch (err) {
      setPostActionError(
        err instanceof Error ? err.message : 'Could not edit post.',
      );
    } finally {
      setPostActionLoading(false);
    }
  };

  const toggleSelectedPostPin = async () => {
    if (!selectedPost || (!canPost && !isDeveloper) || postActionLoading) return;

    setPostActionLoading(true);
    setPostActionError('');

    const nextPinned = !Boolean((selectedPost as any).is_pinned);

    try {
      const { error: pinError } = await (supabase as any).rpc(
        'set_channel_post_pinned',
        {
          p_post_id: selectedPost.id,
          p_is_pinned: nextPinned,
        },
      );

      if (pinError) throw pinError;

      setPosts((current) =>
        current.map((post) =>
          post.id === selectedPost.id
            ? ({ ...post, is_pinned: nextPinned } as ChannelPostWithSender)
            : post,
        ),
      );

      closePostActions();
    } catch (err) {
      setPostActionError(
        err instanceof Error ? err.message : 'Could not update pin.',
      );
    } finally {
      setPostActionLoading(false);
    }
  };
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <View style={lumoStyles.loadingScreen}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.lime} />
        <Text style={lumoStyles.loadingText}>Opening channel...</Text>
      </View>
    );
  }

  if (error || !channel) {
    return (
      <View style={lumoStyles.loadingScreen}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="alert-circle-outline" size={38} color={colors.muted} />
        <Text style={lumoStyles.errorTitle}>Channel unavailable</Text>
        <Text style={lumoStyles.errorText}>
          {error || 'This channel could not be found.'}
        </Text>
        <Pressable style={lumoStyles.retryButton} onPress={() => void loadChannel()}>
          <Ionicons name="refresh" size={16} color={colors.bg} />
          <Text style={lumoStyles.retryText}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={lumoStyles.backLink}>
          <Text style={lumoStyles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={lumoStyles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
      style={lumoStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={lumoStyles.header}>
        <Pressable
          onPress={() => router.back()}
          style={lumoStyles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>

        <View style={lumoStyles.channelIdentity}>
          <Avatar
            uri={channel.avatar_url}
            name={channel.name}
            size={43}
          />

          <View style={lumoStyles.headerCopy}>
            <Text style={lumoStyles.channelName} numberOfLines={1}>
              {channel.name}
            </Text>
            <Text style={lumoStyles.channelSubtitle} numberOfLines={1}>
              @{channel.username} · {posts.length} updates
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push(`/channels/${id}/members`)}
          style={lumoStyles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Channel members"
        >
          <Ionicons name="people-outline" size={20} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={() => router.push(`/channels/${id}/settings`)}
          style={lumoStyles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Channel settings"
        >
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </Pressable>
      </View>


      <ScrollView
        ref={feedRef}
        style={lumoStyles.feed}
        contentContainerStyle={[
          lumoStyles.messageList,
          posts.length === 0 && lumoStyles.messageListEmpty,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!error && (
          <Pressable
            style={lumoStyles.inlineError}
            onPress={() => void loadChannel()}
          >
            <Text style={lumoStyles.inlineErrorText} numberOfLines={2}>
              {error}
            </Text>
            <Text style={lumoStyles.retryLink}>Retry</Text>
          </Pressable>
        )}

        {posts.length === 0 ? (
          <View style={lumoStyles.emptyState}>
            <View style={lumoStyles.emptyIcon}>
              <Ionicons
                name="megaphone"
                size={28}
                color={colors.bg}
              />
            </View>
            <Text style={lumoStyles.emptyTitle}>
              No updates yet.
            </Text>
            <Text style={lumoStyles.emptyDescription}>
              Channel announcements and shared media will appear here.
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <ChannelPostItem
              key={post.id}
              post={post}
              currentUserId={me}
              onLongPress={(item) => {
                setSelectedPost(item);
                setConfirmingPostDelete(false);
                setEditingSelectedPost(false);
                setPostActionError('');
              }}
              onOpenMedia={(item, url, type) => {
                setSelectedChannelMedia({
                  id: item.id,
                  url,
                  type,
                  senderLabel:
                    item.sender?.full_name ||
                    item.sender?.username ||
                    'Channel admin',
                  createdAt: item.created_at,
                  fileName: item.media_file_name,
                });
              }}
            />
          ))
        )}
      </ScrollView>


      {canPost ? (
        <View style={lumoStyles.composer}>
          <View style={lumoStyles.composerRow}>
            {channel && me ? (
              <ChannelMediaUpload
                channelId={channel.id}
                userId={me}
                canPost={canPost}
                onPublished={loadChannel}
              />
            ) : null}

            <View style={lumoStyles.inputShell}>
              <TextInput
                style={lumoStyles.composerInput}
                placeholder="Write something real..."
                placeholderTextColor={colors.dim}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={5000}
                editable={!sending}
                textAlignVertical="center"
              />
            </View>

            <Pressable
              style={[
                lumoStyles.sendButton,
                (!draft.trim() || sending) && lumoStyles.sendButtonDisabled,
              ]}
              onPress={() => void handlePublish()}
              disabled={!draft.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Publish channel update"
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Ionicons name="arrow-up" size={22} color={colors.bg} />
              )}
            </Pressable>
          </View>

          <View style={lumoStyles.composerFooter}>
            <Ionicons name="sparkles" size={11} color={colors.lime} />
            <Text style={lumoStyles.footerText}>CHANNEL BROADCAST</Text>
          </View>
        </View>
      ) : (
        <View style={lumoStyles.readOnlyComposer}>
          <View style={lumoStyles.readOnlyIcon}>
            <Ionicons name="megaphone-outline" size={18} color={colors.lime} />
          </View>
          <View style={lumoStyles.readOnlyCopy}>
            <Text style={lumoStyles.readOnlyTitle}>Channel updates</Text>
            <Text style={lumoStyles.readOnlyText}>
              Only channel admins can publish updates.
            </Text>
          </View>
        </View>
      )}
      <UniversalForwardModal
        visible={universalForwardSource !== null}
        userId={me}
        source={universalForwardSource}
        onClose={() => setUniversalForwardSource(null)}
      />

      <ChatMediaViewer
        visible={selectedChannelMedia !== null}
        items={selectedChannelMedia ? [selectedChannelMedia] : []}
        initialIndex={0}
        onClose={() => setSelectedChannelMedia(null)}
      />

      <Modal
        visible={selectedPost !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePostActions}
      >
        <View style={lumoStyles.postActionOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closePostActions}
          />

          <View style={lumoStyles.postActionSheet}>
            <View style={lumoStyles.postActionHandle} />

            <Text style={lumoStyles.postActionTitle}>
              {confirmingPostDelete
                ? 'Delete this post for everyone?'
                : editingSelectedPost
                  ? 'Edit post'
                  : 'Post options'}
            </Text>

            {!editingSelectedPost && (
              <Text style={lumoStyles.postActionPreview} numberOfLines={3}>
                {selectedPost?.body?.trim() ||
                  selectedPost?.media_file_name ||
                  'Attachment'}
              </Text>
            )}

            {!!postActionError && (
              <Text style={lumoStyles.postActionError}>{postActionError}</Text>
            )}

            {confirmingPostDelete ? (
              <View style={lumoStyles.postActionButtons}>
                <Pressable
                  style={lumoStyles.postActionButton}
                  disabled={postActionLoading}
                  onPress={() => setConfirmingPostDelete(false)}
                >
                  <Text style={lumoStyles.postActionButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={lumoStyles.postActionDanger}
                  disabled={postActionLoading}
                  onPress={() => void deleteSelectedPost()}
                >
                  {postActionLoading
                    ? <ActivityIndicator color={colors.text} size="small" />
                    : <Text style={lumoStyles.postActionDangerText}>Delete for everyone</Text>}
                </Pressable>
              </View>
            ) : editingSelectedPost ? (
              <>
                <TextInput
                  style={lumoStyles.postActionEditor}
                  value={postEditDraft}
                  onChangeText={setPostEditDraft}
                  multiline
                  maxLength={5000}
                  placeholder="Edit announcement..."
                  placeholderTextColor={colors.muted}
                  editable={!postActionLoading}
                />

                <View style={lumoStyles.postActionButtons}>
                  <Pressable
                    style={lumoStyles.postActionButton}
                    disabled={postActionLoading}
                    onPress={() => {
                      setEditingSelectedPost(false);
                      setPostActionError('');
                    }}
                  >
                    <Text style={lumoStyles.postActionButtonText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={lumoStyles.postActionButton}
                    disabled={postActionLoading || !postEditDraft.trim()}
                    onPress={() => void saveSelectedPostEdit()}
                  >
                    {postActionLoading
                      ? <ActivityIndicator color={colors.lime} size="small" />
                      : <Text style={lumoStyles.postActionButtonText}>Save changes</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={lumoStyles.postActionButtons}>
                <Pressable
                  style={[
                    lumoStyles.postActionButton,
                    !selectedPost?.body?.trim() && lumoStyles.postActionDisabled,
                  ]}
                  disabled={!selectedPost?.body?.trim() || postActionLoading}
                  onPress={() => void copySelectedPost()}
                >
                  <Ionicons name="copy-outline" size={17} color={colors.text} />
                  <Text style={lumoStyles.postActionButtonText}>Copy</Text>
                </Pressable>

                <Pressable
                  style={lumoStyles.postActionButton}
                  disabled={postActionLoading}
                  onPress={() => {
                    if (!selectedPost) return;

                    setUniversalForwardSource({
                      type: 'channel',
                      id: selectedPost.id,
                      senderLabel:
                        selectedPost.sender?.full_name ||
                        selectedPost.sender?.username ||
                        'Channel admin',
                      chatLabel: 'Channel',
                      body: selectedPost.body,
                      messageType: selectedPost.message_type,
                      mediaPath: selectedPost.media_path,
                      mediaMimeType: selectedPost.media_mime_type,
                      mediaFileName: selectedPost.media_file_name,
                    });

                    closePostActions();
                  }}
                >
                  <Ionicons name="arrow-redo-outline" size={17} color={colors.text} />
                  <Text style={lumoStyles.postActionButtonText}>Forward</Text>
                </Pressable>

                <Pressable
                  style={[
                    lumoStyles.postActionButton,
                    (selectedPost?.sender_id !== me ||
                      selectedPost?.message_type !== 'text' ||
                      !canPost) && lumoStyles.postActionDisabled,
                  ]}
                  disabled={
                    selectedPost?.sender_id !== me ||
                    selectedPost?.message_type !== 'text' ||
                    !canPost ||
                    postActionLoading
                  }
                  onPress={() => {
                    if (!selectedPost) return;
                    setPostEditDraft(selectedPost.body ?? '');
                    setEditingSelectedPost(true);
                  }}
                >
                  <Ionicons name="create-outline" size={17} color={colors.text} />
                  <Text style={lumoStyles.postActionButtonText}>Edit</Text>
                </Pressable>

                {(canPost || isDeveloper) && (
                  <Pressable
                    style={lumoStyles.postActionButton}
                    disabled={postActionLoading}
                    onPress={() => void toggleSelectedPostPin()}
                  >
                    <Ionicons
                      name={(selectedPost as any)?.is_pinned ? 'pin-outline' : 'pin'}
                      size={17}
                      color={colors.text}
                    />
                    <Text style={lumoStyles.postActionButtonText}>
                      {(selectedPost as any)?.is_pinned ? 'Unpin' : 'Pin'}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={lumoStyles.postActionButton}
                  disabled={postActionLoading}
                  onPress={() => void hideSelectedPost()}
                >
                  <Ionicons name="eye-off-outline" size={17} color={colors.text} />
                  <Text style={lumoStyles.postActionButtonText}>Delete for me</Text>
                </Pressable>

                {canPost && (
                  <Pressable
                    style={lumoStyles.postActionDeleteRow}
                    disabled={postActionLoading}
                    onPress={() => {
                      setConfirmingPostDelete(true);
                      setPostActionError('');
                    }}
                  >
                    <Ionicons name="trash-outline" size={17} color={resolveThemeColor("#FF9CAC", "color")} />
                    <Text style={lumoStyles.postActionDeleteText}>
                      Delete for everyone
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
      <SafeAreaView edges={['bottom']} style={lumoStyles.bottomSafe} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 12,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 14,
  },
  errorText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 7,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.lime,
    borderRadius: 13,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 20,
  },
  retryText: {
    color: colors.bg,
    fontSize: 12,
    fontWeight: '900',
  },
  backLink: {
    marginTop: 17,
    padding: 8,
  },
  backLinkText: {
    color: colors.lime,
    fontSize: 12,
    fontWeight: '700',
  },

  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  channelName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  channelSubtitle: {
    color: colors.muted,
    fontSize: 10.5,
    marginTop: 4,
  },

  feed: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    flexGrow: 1,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inlineError: {
    marginHorizontal: 2,
    marginBottom: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 11,
    backgroundColor: '#28191C',
  },
  inlineErrorText: {
    flex: 1,
    color: '#FF9CAC',
    fontSize: 11,
  },
  retryLink: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 8,
  },
  emptyState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10,
  },
  emptyIcon: {
    width: 65,
    height: 65,
    borderRadius: 23,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },

  composer: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  inputShell: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  composerInput: {
    minHeight: 42,
    maxHeight: 108,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  sendButtonDisabled: {
    backgroundColor: '#3A4033',
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  footerText: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  readOnlyComposer: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readOnlyIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readOnlyCopy: {
    flex: 1,
    gap: 4,
  },
  readOnlyTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  readOnlyText: {
    color: colors.muted,
    fontSize: 10,
  },
  bottomSafe: {
    backgroundColor: colors.surface,
  },

  postActionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  postActionSheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '82%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 30,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#12161C',
    borderWidth: 1,
    borderColor: '#30382A',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 22,
  },
  postActionHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginBottom: 18,
    borderRadius: 3,
    backgroundColor: '#59634D',
  },
  postActionTitle: {
    color: '#F2F5F7',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: 8,
  },
  postActionPreview: {
    color: '#A5AD9E',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#121710',
    borderWidth: 1,
    borderColor: '#293222',
  },
  postActionError: {
    color: '#FF8A99',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#241519',
    borderWidth: 1,
    borderColor: '#52303A',
  },
  postActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  postActionButton: {
    minHeight: 54,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#151A12',
    borderWidth: 1,
    borderColor: '#2D3726',
  },
  postActionButtonText: {
    color: '#EDF1E7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  postActionDanger: {
    minHeight: 52,
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: '#A93148',
    borderWidth: 1,
    borderColor: '#D05A70',
  },
  postActionDangerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  postActionDeleteRow: {
    width: '100%',
    minHeight: 50,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingHorizontal: 15,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#542B35',
    backgroundColor: '#211418',
  },
  postActionDeleteText: {
    color: '#FF9CAA',
    fontSize: 12,
    fontWeight: '800',
  },
  postActionEditor: {
    minHeight: 110,
    maxHeight: 220,
    padding: 12,
    borderRadius: 13,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  postActionDisabled: {
    opacity: 0.4,
  },
});
