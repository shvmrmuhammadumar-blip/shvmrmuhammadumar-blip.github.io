import UniversalForwardModal, { type ForwardSource } from "../../../components/UniversalForwardModal";
import ChatMediaViewer, { type ChatMediaViewerItem } from '../../../components/ChatMediaViewer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Avatar from '../../../components/Avatar';
import GroupMessageItem from '../../../components/groups/GroupMessageItem';
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import {
  getChatMediaUrl,
  getChatMediaDownloadUrl,
  pickChatFile,
  pickChatMedia,
  uploadChatMedia,
  type PickedChatMedia,
} from '../../../lib/api';
import {
  getGroup,
  getGroupMembers,
  getGroupMessages,
  sendGroupMessage,
  editGroupMessage,
  deleteGroupMessage,
  addGroupMessageReaction,
  removeGroupMessageReaction,
  subscribeToGroupMessages,
  type GroupMemberWithProfile,
  type GroupMessageWithSender,
} from '../../../lib/groups';
import { supabase } from '../../../lib/supabase';
import { useThemedStyles, resolveThemeColor } from "../../../lib/theme-styles";
import { colors } from '../../../lib/theme';


const palette = {
  get bg() { return colors.bg; },
  get surface() { return colors.surface; },
  get raised() { return colors.surfaceRaised; },
  get soft() { return colors.surfaceSoft; },
  get text() { return colors.text; },
  get muted() { return colors.muted; },
  get dim() { return colors.dim; },
  get border() { return colors.border; },
  get lime() { return colors.accent; },
  get limeDark() { return colors.accentDark; },
  get danger() { return colors.danger; },
};

type Reaction = {
  group_message_id: string;
  user_id: string;
  reaction: string;
};

type GroupChatMessage = GroupMessageWithSender & {
  media_url: string | null;
  reactions: Reaction[];
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(value: number | null) {
  if (value == null || value <= 0) return 'Attachment ready';

  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default function GroupChat() {
  const lumoStyles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;

  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;

  const listRef = useRef<FlatList<GroupChatMessage>>(null);

  const [group, setGroup] = useState<Awaited<ReturnType<typeof getGroup>> | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [messages, setMessages] = useState<GroupChatMessage[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<GroupChatMessage | null>(null);
  const [pendingMedia, setPendingMedia] = useState<PickedChatMedia | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<GroupChatMessage | null>(null);
  const [universalForwardSource, setUniversalForwardSource] =
    useState<ForwardSource | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [membersVisible, setMembersVisible] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<ChatMediaViewerItem | null>(null);

  const canSend = useMemo(
    () => Boolean((text.trim() || pendingMedia) && !sending),
    [text, pendingMedia, sending],
  );

  const jumpToMessage = useCallback((messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;

    setHighlightedMessageId(messageId);

    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    });
  }, [messages]);

  useEffect(() => {
    if (!highlightedMessageId) return;

    const timeout = setTimeout(
      () => setHighlightedMessageId(null),
      1800,
    );

    return () => clearTimeout(timeout);
  }, [highlightedMessageId]);

  const loadMessages = useCallback(async (stillActive?: () => boolean) => {
    if (!groupId) return;

    const rows = await getGroupMessages(groupId, 100);

    const ids = rows.map((item) => item.id);
    let reactions: Reaction[] = [];

    if (ids.length > 0) {
      const { data, error } = await supabase
        .from('group_message_reactions')
        .select('group_message_id, user_id, reaction')
        .in('group_message_id', ids);

      if (error) throw error;
      reactions = (data ?? []) as Reaction[];
    }

    const enriched = await Promise.all(
      rows.map(async (item) => {
        let mediaUrl: string | null = null;

        if (item.media_path) {
          try {
            mediaUrl = await getChatMediaUrl(item.media_path);
          } catch {
            mediaUrl = null;
          }
        }

        return {
          ...item,
          media_url: mediaUrl,
          reactions: reactions.filter(
            (reaction) => reaction.group_message_id === item.id,
          ),
        };
      }),
    );

    if (stillActive && !stillActive()) return;

    setMessages(enriched);
    setErrorText('');
  }, [groupId]);

  const loadScreen = useCallback(async (stillActive?: () => boolean) => {
    if (!groupId) throw new Error('Group ID is missing.');

    const [groupData, memberRows] = await Promise.all([
      getGroup(groupId),
      getGroupMembers(groupId).catch(() => []),
    ]);

    if (stillActive && !stillActive()) return;

    setGroup(groupData);
    setMembers(memberRows);

    await loadMessages(stillActive);
  }, [groupId, loadMessages]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setErrorText('');

    void loadScreen(() => active)
      .catch((error) => {
        if (active) {
          setErrorText(
            error instanceof Error ? error.message : 'Could not open this group.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    if (!groupId) {
      return () => {
        active = false;
      };
    }

    const channel = subscribeToGroupMessages(groupId, () => {
      void loadMessages().catch((error) => {
        if (active) {
          setErrorText(
            error instanceof Error ? error.message : 'Could not refresh messages.',
          );
        }
      });
    });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadMessages, loadScreen]);

  const refresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await loadScreen();
    } catch (error) {
      setErrorText(
        error instanceof Error ? error.message : 'Could not refresh this group.',
      );
    } finally {
      setRefreshing(false);
    }
  }, [loadScreen]);

  const chooseMedia = async () => {
    try {
      const picked = await pickChatMedia();
      if (picked) setPendingMedia(picked);
    } catch (error) {
      Alert.alert(
        'Could not attach media',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const chooseFile = async () => {
    try {
      const picked = await pickChatFile();
      if (picked) setPendingMedia(picked);
    } catch (error) {
      Alert.alert(
        'Could not attach file',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  };

  const send = useCallback(async () => {
    if (!me || !groupId || !canSend) return;

    const body = text.trim();

    setSending(true);
    setErrorText('');

    let uploadedPath: string | null = null;
    let messageSaved = false;

    try {
      if (editingMessage) {
        await editGroupMessage(editingMessage.id, body);
        messageSaved = true;
      } else {
        if (pendingMedia) {
          uploadedPath = await uploadChatMedia(pendingMedia, me);
        }

        await sendGroupMessage({
          groupId,
          senderId: me,
          body: body || null,
          messageType: pendingMedia?.type ?? 'text',
          mediaPath: uploadedPath,
          mediaMimeType: pendingMedia?.mimeType ?? null,
          mediaFileName: pendingMedia?.fileName ?? null,
          replyTo: replyTo?.id ?? null,
        });

        messageSaved = true;
      }

      setText('');
      setReplyTo(null);
      setEditingMessage(null);
      setPendingMedia(null);
      Keyboard.dismiss();

      await loadMessages();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (error) {
      if (uploadedPath && !messageSaved) {
        try {
          await supabase.storage.from('chat-media').remove([uploadedPath]);
        } catch {
          // Keep the original sending error.
        }
      }

      Alert.alert(
        'Message not sent',
        error instanceof Error ? error.message : 'Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  }, [
    me,
    groupId,
    canSend,
    text,
    editingMessage,
    pendingMedia,
    replyTo,
    loadMessages,
  ]);

  const toggleReaction = useCallback(async (
    message: GroupChatMessage,
    reaction: string,
  ) => {
    if (!me) return;

    const previous = message.reactions;
    const exists = previous.some(
      (item) => item.user_id === me && item.reaction === reaction,
    );

    const next = exists
      ? previous.filter(
          (item) => !(item.user_id === me && item.reaction === reaction),
        )
      : [
          ...previous,
          {
            group_message_id: message.id,
            user_id: me,
            reaction,
          },
        ];

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, reactions: next } : item,
      ),
    );

    try {
      if (exists) {
        await removeGroupMessageReaction(message.id, me, reaction);
      } else {
        await addGroupMessageReaction(message.id, me, reaction);
      }
    } catch (error) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, reactions: previous } : item,
        ),
      );

      Alert.alert(
        'Reaction not saved',
        error instanceof Error ? error.message : 'Please try again.',
      );
    }
  }, [me]);

  const openAttachment = async (message: GroupChatMessage) => {
    if (!message.media_path) return;

    try {
      const fileName = message.media_file_name || 'attachment';
      const url = await getChatMediaDownloadUrl(message.media_path, fileName);
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(
        'Attachment unavailable',
        error instanceof Error ? error.message : 'Could not open this file.',
      );
    }
  };

  const deleteSelectedMessage = async () => {
    if (!selectedMessage || selectedMessage.sender_id !== me) return;

    setActionLoading(true);

    try {
      await deleteGroupMessage(selectedMessage.id);

      setMessages((current) =>
        current.filter((item) => item.id !== selectedMessage.id),
      );

      setSelectedMessage(null);
      setConfirmingDelete(false);
    } catch (error) {
      Alert.alert(
        'Could not delete message',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setActionLoading(false);
    }
  };

  const startReply = () => {
    if (!selectedMessage) return;

    setReplyTo(selectedMessage);
    setEditingMessage(null);
    setSelectedMessage(null);
    Keyboard.dismiss();
  };

  const startEdit = () => {
    if (
      !selectedMessage ||
      selectedMessage.sender_id !== me ||
      selectedMessage.message_type !== 'text' ||
      !selectedMessage.body
    ) {
      return;
    }

    setEditingMessage(selectedMessage);
    setReplyTo(null);
    setText(selectedMessage.body);
    setSelectedMessage(null);
    Keyboard.dismiss();
  };

  const openMessageMedia = (
    url: string | null,
    type: 'image' | 'video',
  ) => {
    if (!url) {
      Alert.alert(
        'Attachment unavailable',
        'This attachment could not be loaded. Please try again.',
      );
      return;
    }

    const sourceMessage = messages.find(
      (message) => message.media_url === url && message.message_type === type,
    );

    if (!sourceMessage) return;

    setSelectedMedia({
      id: sourceMessage.id,
      url,
      type,
      senderLabel:
        (sourceMessage as any).sender?.full_name ||
        (sourceMessage as any).sender?.username ||
        'Group member',
      createdAt: sourceMessage.created_at,
      fileName: (sourceMessage as any).media_file_name ?? null,
    });
  };

  const visibleMessages = messages;

  const myRole = members.find((member) => member.user_id === me)?.role;

  return (
    <SafeAreaView style={lumoStyles.safeArea} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={lumoStyles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 18}
      >
        <View style={lumoStyles.header}>
          <Pressable
            onPress={() => router.back()}
            style={lumoStyles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color={palette.text} />
          </Pressable>

          <Pressable
            style={lumoStyles.groupIdentity}
            onPress={() => setMembersVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="View group members"
          >
            <Avatar
              uri={group?.avatar_url}
              name={group?.name ?? 'Group'}
              size={43}
            />

            <View style={lumoStyles.headerCopy}>
              <Text style={lumoStyles.groupName} numberOfLines={1}>
                {group?.name ?? 'Group chat'}
              </Text>
              <Text style={lumoStyles.groupSubtitle} numberOfLines={1}>
                {members.length} members
                {myRole ? ` · ${myRole}` : ''}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              if (group) router.push(`/groups/${group.id}/member`);
            }}
            style={lumoStyles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Manage group members"
          >
            <Ionicons name="people-outline" size={21} color={palette.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (group) router.push(`/groups/${group.id}/settings`);
            }}
            style={lumoStyles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Group settings"
          >
            <Ionicons name="settings-outline" size={20} color={palette.text} />
          </Pressable>
        </View>

        {loading ? (
          <View style={lumoStyles.centerState}>
            <ActivityIndicator color={palette.lime} size="large" />
            <Text style={lumoStyles.stateText}>Opening group...</Text>
          </View>
        ) : errorText && !group ? (
          <View style={lumoStyles.centerState}>
            <Ionicons name="cloud-offline-outline" size={30} color={palette.lime} />
            <Text style={lumoStyles.stateTitle}>Group unavailable</Text>
            <Text style={lumoStyles.stateText}>{errorText}</Text>
            <Pressable onPress={() => void refresh()} style={lumoStyles.retryButton}>
              <Text style={lumoStyles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!!errorText && (
              <Pressable onPress={() => void refresh()} style={lumoStyles.inlineError}>
                <Text style={lumoStyles.inlineErrorText} numberOfLines={2}>
                  {errorText}
                </Text>
                <Text style={lumoStyles.retryLink}>Retry</Text>
              </Pressable>
            )}

            <FlatList
              ref={listRef}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              data={visibleMessages}
              keyExtractor={(item) => item.id}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                listRef.current?.scrollToOffset({
                  offset: averageItemLength * index,
                  animated: false,
                });
                setTimeout(() => {
                  listRef.current?.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0.5,
                  });
                }, 80);
              }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                lumoStyles.messageList,
                visibleMessages.length === 0 && lumoStyles.messageListEmpty,
              ]}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const replyMessage = messages.find(
                  (message) => message.id === item.reply_to,
                ) ?? null;

                return (
                  <GroupMessageItem
                    message={item}
                    replyMessage={replyMessage}
                    currentUserId={me}
                    onJumpToReply={jumpToMessage}
                    highlighted={highlightedMessageId === item.id}
                    onLongPress={(message) => {
                      setSelectedMessage(message);
                      setConfirmingDelete(false);
                    }}
                    onToggleReaction={(message, reaction) => {
                      void toggleReaction(message, reaction);
                    }}
                    onOpenMedia={(url, type) => {
                      openMessageMedia(url, type);
                    }}
                    onOpenAttachment={(message) => {
                      void openAttachment(message);
                    }}
                  />
                );
              }}              ListEmptyComponent={
                <View style={lumoStyles.emptyState}>
                  <View style={lumoStyles.emptyIcon}>
                    <Ionicons name="people" size={29} color={palette.bg} />
                  </View>
                  <Text style={lumoStyles.emptyTitle}>Your group starts here.</Text>
                  <Text style={lumoStyles.emptyDescription}>
                    Send the first message and bring everyone into the conversation.
                  </Text>
                </View>
              }
            />

            <View style={lumoStyles.composer}>
              {(replyTo || editingMessage) && (
                <View style={lumoStyles.composerContext}>
                  <View style={lumoStyles.contextAccent} />
                  <View style={lumoStyles.contextCopy}>
                    <Text style={lumoStyles.contextTitle}>
                      {editingMessage
                        ? 'Editing message'
                        : `Replying to ${replyTo?.sender?.username ?? 'member'}`}
                    </Text>
                    <Text style={lumoStyles.contextBody} numberOfLines={1}>
                      {editingMessage?.body ?? replyTo?.body ?? 'Attachment'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setReplyTo(null);
                      setEditingMessage(null);
                      setText('');
                    }}
                    style={lumoStyles.removeButton}
                  >
                    <Ionicons name="close" size={17} color={palette.text} />
                  </Pressable>
                </View>
              )}

              {pendingMedia && (
                <View style={lumoStyles.attachmentPreview}>
                  <View style={lumoStyles.attachmentIcon}>
                    {pendingMedia.type === 'image' ? (
                      <Image
                        source={{ uri: pendingMedia.uri }}
                        style={lumoStyles.previewImage}
                        contentFit="cover"
                      />
                    ) : (
                      <Ionicons
                        name={
                          pendingMedia.type === 'video'
                            ? 'videocam-outline'
                            : pendingMedia.type === 'audio'
                              ? 'musical-notes-outline'
                              : 'document-outline'
                        }
                        size={22}
                        color={palette.lime}
                      />
                    )}
                  </View>
                  <View style={lumoStyles.attachmentCopy}>
                    <Text style={lumoStyles.attachmentName} numberOfLines={1}>
                      {pendingMedia.fileName || 'Selected attachment'}
                    </Text>
                    <Text style={lumoStyles.attachmentSize}>
                      {formatBytes(pendingMedia.fileSize)} · 50 MB max
                    </Text>
                  </View>
                  <Pressable onPress={() => setPendingMedia(null)} style={lumoStyles.removeButton}>
                    <Ionicons name="close" size={17} color={palette.text} />
                  </Pressable>
                </View>
              )}

              <View style={lumoStyles.composerRow}>
                <Pressable
                  style={lumoStyles.attachButton}
                  onPress={() => void chooseMedia()}
                  disabled={sending || !!editingMessage}
                >
                  <Ionicons name="add" size={25} color={palette.text} />
                </Pressable>

                <Pressable
                  style={lumoStyles.fileButton}
                  onPress={() => void chooseFile()}
                  disabled={sending || !!editingMessage}
                >
                  <Ionicons name="document-outline" size={19} color={palette.lime} />
                </Pressable>

                <View style={lumoStyles.inputShell}>
                  <TextInput
                    style={lumoStyles.input}
                    value={text}
                    onChangeText={setText}
                    placeholder={editingMessage ? 'Edit your message…' : 'Write something real…'}
                    placeholderTextColor={palette.dim}
                    maxLength={2000}
                    multiline
                    editable={!sending}
                    textAlignVertical="center"
                  />
                </View>

                <Pressable
                  style={[lumoStyles.sendButton, !canSend && lumoStyles.sendDisabled]}
                  onPress={() => void send()}
                  disabled={!canSend}
                  accessibilityRole="button"
                  accessibilityLabel="Send group message"
                >
                  {sending ? (
                    <ActivityIndicator color={palette.bg} size="small" />
                  ) : (
                    <Ionicons name={editingMessage ? 'checkmark' : 'arrow-up'} size={22} color={palette.bg} />
                  )}
                </Pressable>
              </View>

              <View style={lumoStyles.composerFooter}>
                <Ionicons name="sparkles" size={11} color={palette.lime} />
                <Text style={lumoStyles.footerText}>YOUR PEOPLE. YOUR MOMENTS.</Text>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <SafeAreaView edges={['bottom']} style={lumoStyles.bottomSafe} />

      <Modal
        visible={membersVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMembersVisible(false)}
      >
        <View style={lumoStyles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMembersVisible(false)}
          />
          <View style={lumoStyles.sheet}>
            <View style={lumoStyles.sheetHandle} />
            <View style={lumoStyles.sheetHeader}>
              <View>
                <Text style={lumoStyles.sheetTitle}>Group members</Text>
                <Text style={lumoStyles.sheetSubtitle}>{members.length} people</Text>
              </View>
              <Pressable onPress={() => setMembersVisible(false)} style={lumoStyles.closeButton}>
                <Ionicons name="close" size={19} color={palette.text} />
              </Pressable>
            </View>

            <FlatList
              data={members}
              keyExtractor={(item) => item.user_id}
              style={lumoStyles.memberList}
              renderItem={({ item }) => (
                <View style={lumoStyles.memberRow}>
                  <Avatar
                    uri={item.profile?.avatar_url}
                    name={item.profile?.username ?? 'Member'}
                    size={42}
                  />
                  <View style={lumoStyles.memberCopy}>
                    <Text style={lumoStyles.memberName}>
                      {item.profile?.full_name || item.profile?.username || 'Lumo member'}
                    </Text>
                    <Text style={lumoStyles.memberUsername}>
                      @{item.profile?.username ?? 'member'}
                    </Text>
                  </View>
                  <Text style={lumoStyles.memberRole}>{item.role}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={lumoStyles.noMembers}>No member details available.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={selectedMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!actionLoading) {
            setSelectedMessage(null);
            setConfirmingDelete(false);
          }
        }}
      >
        <View style={lumoStyles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!actionLoading) {
                setSelectedMessage(null);
                setConfirmingDelete(false);
              }
            }}
          />
          <View style={lumoStyles.messageActionSheet}>
            <View style={lumoStyles.messageActionHandle} />
            <Text style={lumoStyles.messageActionTitle}>
              {confirmingDelete ? 'Delete this message?' : 'Message options'}
            </Text>
            <Text style={lumoStyles.messageActionSubtitle} numberOfLines={2}>
              {selectedMessage?.body || 'Group message'}
            </Text>

            {confirmingDelete ? (
              <View style={lumoStyles.messageActionButtons}>
                <Pressable
                  style={lumoStyles.messageActionSecondary}
                  onPress={() => setConfirmingDelete(false)}
                  disabled={actionLoading}
                >
                  <Text style={lumoStyles.messageActionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={lumoStyles.messageActionDanger}
                  onPress={() => void deleteSelectedMessage()}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={lumoStyles.messageActionDangerText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={lumoStyles.messageActionButtons}>
                <Pressable style={lumoStyles.messageActionSecondary} onPress={startReply}>
                  <Ionicons name="arrow-undo-outline" size={17} color={palette.text} />
                  <Text style={lumoStyles.messageActionText}>Reply</Text>
                </Pressable>

                <Pressable
                  style={lumoStyles.messageActionSecondary}
                  onPress={() => {
                    if (!selectedMessage) return;

                    setUniversalForwardSource({
                      type: 'group',
                      id: selectedMessage.id,
                      senderLabel:
                        selectedMessage.sender?.full_name ||
                        selectedMessage.sender?.username ||
                        'Group member',
                      chatLabel: 'Group',
                      body: selectedMessage.body,
                      messageType: selectedMessage.message_type,
                      mediaPath: selectedMessage.media_path,
                      mediaMimeType: selectedMessage.media_mime_type,
                      mediaFileName: selectedMessage.media_file_name,
                    });

                    setSelectedMessage(null);
                    setConfirmingDelete(false);
                  }}
                >
                  <Ionicons name="arrow-redo-outline" size={17} color={palette.text} />
                  <Text style={lumoStyles.messageActionText}>Forward</Text>
                </Pressable>

                <Pressable
                  style={[
                    lumoStyles.messageActionSecondary,
                    selectedMessage?.sender_id !== me && lumoStyles.messageActionDisabled,
                    selectedMessage?.message_type !== 'text' && lumoStyles.messageActionDisabled,
                  ]}
                  disabled={
                    selectedMessage?.sender_id !== me ||
                    selectedMessage?.message_type !== 'text'
                  }
                  onPress={startEdit}
                >
                  <Ionicons name="create-outline" size={17} color={palette.text} />
                  <Text style={lumoStyles.messageActionText}>Edit</Text>
                </Pressable>

                <Pressable
                  style={lumoStyles.messageActionSecondary}
                  onPress={() => {
                    if (selectedMessage) void toggleReaction(selectedMessage, '❤️');
                    setSelectedMessage(null);
                  }}
                >
                  <Text style={lumoStyles.messageActionEmoji}>❤️</Text>
                  <Text style={lumoStyles.messageActionText}>React</Text>
                </Pressable>

                {selectedMessage?.sender_id === me && (
                  <Pressable
                    style={lumoStyles.messageActionDeleteRow}
                    onPress={() => setConfirmingDelete(true)}
                  >
                    <Ionicons name="trash-outline" size={17} color={palette.danger} />
                    <Text style={lumoStyles.messageActionDeleteText}>Delete message</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      <UniversalForwardModal
        visible={universalForwardSource !== null}
        userId={me}
        source={universalForwardSource}
        onClose={() => setUniversalForwardSource(null)}
      />

      <ChatMediaViewer
        visible={selectedMedia !== null}
        items={selectedMedia ? [selectedMedia] : []}
        initialIndex={0}
        onClose={() => setSelectedMedia(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.bg },
  screen: { flex: 1, backgroundColor: palette.bg },

  header: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  groupName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  groupSubtitle: { color: palette.muted, fontSize: 10.5, marginTop: 4 },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  stateTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  stateText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 5,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: palette.lime,
  },
  retryText: { color: palette.bg, fontSize: 12, fontWeight: '900' },
  inlineError: {
    marginHorizontal: 13,
    marginTop: 7,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 11,
    backgroundColor: '#28191C',
  },
  inlineErrorText: { flex: 1, color: '#FF9CAC', fontSize: 11 },
  retryLink: { color: palette.lime, fontSize: 11, fontWeight: '800', marginLeft: 8 },

  messageList: { paddingHorizontal: 12, paddingVertical: 16 },
  messageListEmpty: { flexGrow: 1, justifyContent: 'center' },
  messageLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  messageLineMine: { justifyContent: 'flex-end' },
  messageLineOther: { justifyContent: 'flex-start' },
  messageContent: { maxWidth: '82%', minWidth: 55 },
  senderName: {
    color: palette.lime,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 4,
    marginBottom: 4,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 17,
    borderWidth: 1,
    maxWidth: '100%',
  },
  bubbleMine: {
    backgroundColor: palette.lime,
    borderColor: palette.lime,
    borderBottomRightRadius: 5,
  },
  bubbleOther: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderBottomLeftRadius: 5,
  },
  messageText: { fontSize: 13.5, lineHeight: 20 },
  ownText: { color: palette.bg, fontWeight: '600' },
  otherText: { color: palette.text },
  editedText: {
    fontSize: 9,
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 3,
    color: palette.dim,
  },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  messageTime: { color: palette.muted, fontSize: 9 },
  replyPreview: {
    borderLeftWidth: 2,
    borderLeftColor: palette.lime,
    paddingLeft: 8,
    marginBottom: 7,
  },
  replyTitle: { color: palette.lime, fontSize: 9.5, fontWeight: '800' },
  replyBody: { color: palette.muted, fontSize: 10.5, marginTop: 2 },

  messageImage: {
    width: 218,
    height: 190,
    maxWidth: '100%',
    borderRadius: 11,
    marginBottom: 5,
  },
  videoCard: {
    width: 205,
    maxWidth: '100%',
    minWidth: 0,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: palette.raised,
    marginBottom: 6,
  },
  videoText: { color: palette.text, fontSize: 10, marginTop: 3 },
  attachmentUnavailable: { color: palette.danger, fontSize: 11, padding: 12 },
  fileCard: {
    minWidth: 0,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginBottom: 5,
  },
  fileCopy: { flex: 1, minWidth: 0, gap: 4 },
  fileName: { color: palette.text, fontSize: 11, fontWeight: '800' },
  fileHint: { color: palette.muted, fontSize: 8, fontWeight: '800' },

  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  reactionChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  reactionChipActive: { borderColor: palette.lime, backgroundColor: palette.limeDark },
  reactionText: { color: palette.text, fontSize: 10 },
  addReaction: {
    width: 24,
    height: 23,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
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
    backgroundColor: palette.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  emptyTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyDescription: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
  },

  composer: {
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    marginBottom: 9,
    backgroundColor: palette.raised,
    borderRadius: 12,
  },
  contextAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: palette.lime },
  contextCopy: { flex: 1, gap: 3 },
  contextTitle: { color: palette.lime, fontSize: 10, fontWeight: '800' },
  contextBody: { color: palette.muted, fontSize: 10 },
  removeButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.soft,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    marginBottom: 9,
    backgroundColor: palette.raised,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.border,
  },
  attachmentIcon: {
    width: 45,
    height: 45,
    borderRadius: 11,
    backgroundColor: palette.soft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: 45, height: 45 },
  attachmentCopy: { flex: 1, minWidth: 0, gap: 3 },
  attachmentName: { color: palette.text, fontSize: 11, fontWeight: '800' },
  attachmentSize: { color: palette.muted, fontSize: 9 },

  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  attachButton: {
    width: 42,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.soft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  fileButton: {
    width: 37,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.soft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  inputShell: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    justifyContent: 'center',
    backgroundColor: palette.raised,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
  },
  input: {
    minHeight: 42,
    maxHeight: 108,
    paddingVertical: 9,
    color: palette.text,
    fontSize: 13,
    lineHeight: 19,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.lime,
  },
  sendDisabled: { backgroundColor: '#3A4033' },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  footerText: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  bottomSafe: { backgroundColor: palette.surface },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  messageActionSheet: {
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
  messageActionHandle: {
    width: 42,
    height: 4,
    alignSelf: 'center',
    marginBottom: 18,
    borderRadius: 3,
    backgroundColor: '#59634D',
  },
  messageActionTitle: {
    color: '#F2F5F7',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: 8,
  },
  messageActionSubtitle: {
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
  messageActionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  messageActionSecondary: {
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
  messageActionText: {
    color: '#EDF1E7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  messageActionEmoji: {
    fontSize: 16,
  },
  messageActionDanger: {
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
  messageActionDangerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  messageActionDeleteRow: {
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
  messageActionDisabled: { opacity: 0.4 },
  messageActionDeleteText: {
    color: '#FF9CAA',
    fontSize: 12,
    fontWeight: '800',
  },  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    maxHeight: '76%',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sheetHandle: {
    width: 35,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: palette.dim,
    marginBottom: 15,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: { color: palette.text, fontSize: 17, fontWeight: '900' },
  sheetSubtitle: { color: palette.muted, fontSize: 11, marginTop: 4 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
  },
  memberList: { marginTop: 10 },
  memberRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  memberCopy: { flex: 1, gap: 3 },
  memberName: { color: palette.text, fontSize: 12, fontWeight: '800' },
  memberUsername: { color: palette.muted, fontSize: 10 },
  memberRole: { color: palette.lime, fontSize: 10, fontWeight: '800' },
  noMembers: { color: palette.muted, textAlign: 'center', padding: 20 },

  actionButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 17 },
  actionSecondary: {
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: palette.soft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionText: { color: palette.text, fontSize: 11, fontWeight: '800' },
  actionEmoji: { fontSize: 15 },
  actionDelete: {
    width: '100%',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    backgroundColor: '#241922',
    borderWidth: 1,
    borderColor: '#58303D',
  },
  actionDanger: {
    flexGrow: 1,
    flexBasis: '40%',
    minHeight: 43,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#742C3D',
  },
  dangerText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.4 },

  mediaViewer: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: 52,
    right: 18,
    zIndex: 5,
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
  },
  viewerImage: { width: '100%', height: '82%' },
  viewerVideo: { width: '100%', flex: 1, marginTop: 100, marginBottom: 60 },
});
