import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getMyGroups } from '../lib/groups';
import { getMyChannels } from '../lib/channels';
import SharedPostCard from './SharedPostCard';
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


export type ForwardSource = {
  type: 'personal' | 'group' | 'channel' | 'post';
  id: string;
  senderLabel: string;
  chatLabel: string;
  body?: string | null;
  messageType?: string | null;
  mediaPath?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
};

type TargetKind = 'personal' | 'group' | 'channel';

type ForwardTarget = {
  id: string;
  kind: TargetKind;
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  canSend?: boolean;
};

type Props = {
  visible: boolean;
  userId?: string | null;
  source: ForwardSource | null;
  onClose: () => void;
  onSuccess?: () => void;
};

const db = supabase as any;

const tabs: { id: TargetKind; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'group', label: 'Groups' },
  { id: 'channel', label: 'Channels' },
];

function getExtension(fileName?: string | null, mime?: string | null) {
  const fromName = fileName?.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
  if (fromName) return fromName;

  const fromMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
  };

  return fromMime[mime ?? ''] ?? 'bin';
}

export default function UniversalForwardModal({
  visible,
  userId,
  source,
  onClose,
  onSuccess,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const [activeTab, setActiveTab] = useState<TargetKind>('personal');
  const [targets, setTargets] = useState<ForwardTarget[]>([]);
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !userId) return;

    let active = true;

    const loadTargets = async () => {
      setLoading(true);
      setError('');
      setSearch('');
      setActiveTab('personal');
      setSelectedTargetKeys([]);

      try {
        const [recentResult, groupsResult, channelsResult, developerResult] =
          await Promise.all([
            db.from('messages')
              .select('sender_id, receiver_id, created_at')
              .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
              .order('created_at', { ascending: false })
              .limit(300),

            getMyGroups(userId),
            getMyChannels(userId),
            db.rpc('is_platform_developer'),
          ]);

        if (recentResult.error) throw recentResult.error;
        if (developerResult.error) throw developerResult.error;
        const isDeveloper = Boolean(developerResult.data);

        const personalIds = [
          ...new Set(
            (recentResult.data ?? [])
              .map((row: any) =>
                row.sender_id === userId
                  ? row.receiver_id
                  : row.sender_id,
              )
              .filter((id: string) => id && id !== userId),
          ),
        ];

        const profilesResult = personalIds.length
          ? await db.from('profiles')
              .select('id, username, full_name, avatar_url')
              .in('id', personalIds)
          : { data: [], error: null };

        if (profilesResult.error) throw profilesResult.error;

        const people: ForwardTarget[] = (profilesResult.data ?? []).map(
          (profile: any) => ({
            id: profile.id,
            kind: 'personal',
            name: profile.full_name || profile.username || 'Lumo user',
            subtitle: profile.username
              ? `@${profile.username}`
              : 'Personal chat',
            avatarUrl: profile.avatar_url,
            canSend: true,
          }),
        );

        const groups: ForwardTarget[] = (groupsResult ?? []).map(
          (group: any) => ({
            id: group.id,
            kind: 'group',
            name: group.name || 'Group',
            subtitle: `${group.member_count ?? 0} members`,
            canSend: true,
          }),
        );

        const channels: ForwardTarget[] = (channelsResult ?? [])
          .filter((channel: any) => isDeveloper || channel.my_role === 'owner' || channel.my_role === 'admin' || channel.owner_id === userId)
          .map((channel: any) => {
            const canSend = isDeveloper || channel.my_role === 'owner' || channel.my_role === 'admin' || channel.owner_id === userId;

            return {
              id: channel.id,
              kind: 'channel',
              name: channel.name || 'Channel',
              subtitle: canSend
                ? channel.username
                  ? `@${channel.username}`
                  : 'You can publish here'
                : 'Subscriber · publishing unavailable',
              canSend,
            };
          },
        );

        if (active) {
          setTargets([...people, ...groups, ...channels]);
          setSelectedTargetKeys([]);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load chats.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTargets();

    return () => {
      active = false;
    };
  }, [visible, userId]);

  const visibleTabs = tabs;

  const filteredTargets = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return targets.filter((target) => {
      if (target.kind !== activeTab) return false;
      if (!normalized) return true;

      return (
        target.name.toLowerCase().includes(normalized) ||
        target.subtitle.toLowerCase().includes(normalized)
      );
    });
  }, [targets, activeTab, search]);

  const forwardToTarget = async (target: ForwardTarget) => {
    if (!source || !userId) {
      throw new Error('Forward source or user is missing.');
    }


    if (target.canSend === false) {
      throw new Error(`You cannot publish to ${target.name}.`);
    }

    if (source.type !== 'post' && !source.body?.trim() && !source.mediaPath) {
      throw new Error('This message has no content to forward.');
    }

    let copiedFile: { bucket: string; path: string } | null = null;

    try {
      const messageType = source.type === 'post' ? 'text' :
        source.messageType || (source.mediaPath ? 'file' : 'text');

      let destinationPath: string | null = null;

      if (source.mediaPath && source.type !== 'post') {
        const sourceBucket =
          source.type === 'channel'
            ? 'community-media'
            : 'chat-media';

        const destinationBucket =
          target.kind === 'channel' ? 'community-media' : 'chat-media';

        const extension = getExtension(
          source.mediaFileName,
          source.mediaMimeType,
        );

        const token =
          `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        destinationPath =
          target.kind === 'channel'
            ? `channels/${target.id}/${userId}/forward-${token}.${extension}`
            : `${userId}/forward-${token}.${extension}`;

        const storage = db.storage.from(sourceBucket);

        const copyResult =
          sourceBucket === destinationBucket
            ? await storage.copy(source.mediaPath, destinationPath)
            : await storage.copy(
                source.mediaPath,
                destinationPath,
                { destinationBucket },
              );

        if (copyResult.error) throw copyResult.error;

        copiedFile = {
          bucket: destinationBucket,
          path: destinationPath,
        };
      }

      const forwardingMetadata = {
        forwarded_from_type: source.type,
        forwarded_from_id: source.id,
        forwarded_from_sender: source.senderLabel,
        forwarded_from_chat: source.chatLabel,
      };

      const mediaFields = {
        message_type: messageType,
        media_path: destinationPath,
        media_mime_type: destinationPath ? source.mediaMimeType : null,
        media_file_name: destinationPath ? source.mediaFileName : null,
      };

      let result: any;

      if (target.kind === 'personal') {
        result = await db.from('messages').insert({
          sender_id: userId,
          receiver_id: target.id,
          body: source.type === 'post' ? 'Shared post' : source.body ?? null,
          ...mediaFields,
          forwarded_from: source.type === 'personal' ? source.id : null,
          ...forwardingMetadata,
        });
      } else if (target.kind === 'group') {
        result = await db.from('group_messages').insert({
          group_id: target.id,
          sender_id: userId,
          body: source.type === 'post' ? 'Shared post' : source.body ?? null,
          ...mediaFields,
          reply_to: null,
          ...forwardingMetadata,
        });
      } else {
        result = await db.from('channel_posts').insert({
          channel_id: target.id,
          sender_id: userId,
          body: source.type === 'post' ? 'Shared post' : source.body ?? null,
          ...mediaFields,
          ...forwardingMetadata,
        });
      }

      if (result.error) throw result.error;
    } catch (err) {
      if (copiedFile) {
        try {
          await db.storage
            .from(copiedFile.bucket)
            .remove([copiedFile.path]);
        } catch {
          // Keep the original forwarding error.
        }
      }

      throw err;
    }
  };

  const sendSelectedTargets = async () => {
    if (!source || !userId || sending) return;

    const selected = targets.filter((target) =>
      selectedTargetKeys.includes(`${target.kind}:${target.id}`) &&
      target.canSend !== false
    );

    if (!selected.length) {
      setError('Select at least one destination.');
      return;
    }

    setSending(true);
    setError('');

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const target of selected) {
      const key = `${target.kind}:${target.id}`;

      try {
        await forwardToTarget(target);
        succeeded.push(key);
      } catch (err) {
        const reason = (() => {
          if (err instanceof Error) return err.message;
          if (typeof err === 'string') return err;
          if (err && typeof err === 'object') {
            const value = err as Record<string, unknown>;
            const fields = ['message', 'code', 'details', 'hint']
              .map((key) => value[key] ? `${key}: ${String(value[key])}` : '')
              .filter(Boolean);
            return fields.join(' | ') || JSON.stringify(err);
          }
          return String(err ?? 'Unknown error');
        })();
        failed.push(`${target.name}: ${reason}`);
      }
    }

    if (succeeded.length) {
      onSuccess?.();
    }

    if (failed.length) {
      setSelectedTargetKeys(succeeded.length
        ? failed.map((failure) => {
            const name = failure.split(':')[0];
            const target = selected.find((item) => item.name === name);
            return target ? `${target.kind}:${target.id}` : '';
          }).filter(Boolean)
        : selected.map((target) => `${target.kind}:${target.id}`)
      );

      setError(
        `${succeeded.length} sent. ${failed.length} failed: ${failed.join(' · ')}`
      );
    } else {
      setSelectedTargetKeys([]);
      onClose();
      Alert.alert(
        'Messages forwarded',
        `Sent to ${succeeded.length} conversations.`,
      );
    }

    setSending(false);
  };
  const sourcePreview =
    source?.type === 'post'
      ? 'Post'
      : source?.body?.trim() ||
        source?.mediaFileName ||
        (source?.mediaPath ? 'Media attachment' : 'Message');

  return (
    <Modal
      visible={visible && !!source}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!sending) onClose();
      }}
    >
      <View style={lumoStyles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (!sending) onClose();
          }}
        />

        <View style={lumoStyles.sheet}>
          <View style={lumoStyles.topBar}>
            <Pressable
              onPress={onClose}
              disabled={sending}
              style={lumoStyles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close forward window"
            >
              <Ionicons name="close" size={20} color={resolveThemeColor("#F2F5F7", "color")} />
            </Pressable>
          </View>

          {source?.type === 'post' ? (
            <SharedPostCard postId={source.id} variant="forward" />
          ) : (
            <View style={lumoStyles.preview}>
              <Ionicons
                name={source?.mediaPath ? 'attach-outline' : 'chatbubble-outline'}
                size={17}
                color={resolveThemeColor("#B9C7D6", "color")}
              />
              <Text style={lumoStyles.previewText} numberOfLines={2}>
                {sourcePreview}
              </Text>
            </View>
          )}
          <View style={lumoStyles.tabs}>
            {visibleTabs.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  setSelectedTargetKeys([]);
                }}
                style={[
                  lumoStyles.tab,
                  activeTab === tab.id && lumoStyles.tabActive,
                ]}
              >
                <Text
                  style={[
                    lumoStyles.tabText,
                    activeTab === tab.id && lumoStyles.tabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={lumoStyles.searchWrap}>
            <Ionicons name="search" size={17} color={resolveThemeColor("#9AA5B2", "color")} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search conversations"
              placeholderTextColor={resolveThemeColor("#747D6E", "placeholderTextColor")}
              style={lumoStyles.searchInput}
              editable={!sending}
            />
          </View>

          {loading ? (
            <View style={lumoStyles.state}>
              <ActivityIndicator color={resolveThemeColor("#B9C7D6", "color")} />
              <Text style={lumoStyles.stateText}>Loading conversations...</Text>
            </View>
          ) : (
            <ScrollView
              style={lumoStyles.targetList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredTargets.map((target) => (
                <Pressable
                  key={`${target.kind}-${target.id}`}
                  onPress={() => {
                    if (target.canSend === false || sending) return;

                    const key = `${target.kind}:${target.id}`;

                    setSelectedTargetKeys([key]);
                  }}
                  disabled={sending || target.canSend === false}
                  style={({ pressed }) => [
                    lumoStyles.targetRow,
                    selectedTargetKeys.includes(`${target.kind}:${target.id}`) &&
                      lumoStyles.targetSelected,
                    pressed && lumoStyles.targetPressed,
                    (sending || target.canSend === false) &&
                      lumoStyles.targetDisabled,
                  ]}
                >
                  <View style={lumoStyles.targetIcon}>
                    <Ionicons
                      name={
                        target.kind === 'personal'
                          ? 'person-outline'
                          : target.kind === 'group'
                            ? 'people-outline'
                            : 'megaphone-outline'
                      }
                      size={19}
                      color={resolveThemeColor("#B9C7D6", "color")}
                    />
                  </View>

                  <View style={lumoStyles.targetCopy}>
                    <Text style={lumoStyles.targetName} numberOfLines={1}>
                      {target.name}
                    </Text>
                    <Text style={lumoStyles.targetSubtitle} numberOfLines={1}>
                      {target.subtitle}
                    </Text>
                  </View>

                  {selectedTargetKeys.includes(`${target.kind}:${target.id}`) ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={21}
                      color={resolveThemeColor("#B9C7D6", "color")}
                    />
                  ) : (
                    <Ionicons
                      name={target.canSend === false ? 'lock-closed-outline' : 'ellipse-outline'}
                      size={19}
                      color={resolveThemeColor("#697263", "color")}
                    />
                  )}
                </Pressable>
              ))}

              {!filteredTargets.length && (
                <View style={lumoStyles.state}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={27}
                    color={resolveThemeColor("#697263", "color")}
                  />
                  <Text style={lumoStyles.stateText}>
                    {activeTab === 'channel'
                      ? 'No channels where you can publish.'
                      : 'No conversations found.'}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {!!error && (
            <Text accessibilityRole="alert" style={lumoStyles.error}>
              {error}
            </Text>
          )}

          <Pressable
            onPress={() => void sendSelectedTargets()}
            disabled={sending || selectedTargetKeys.length === 0}
            style={[
              lumoStyles.sendButton,
              (sending || selectedTargetKeys.length === 0) &&
                lumoStyles.sendButtonDisabled,
            ]}
          >
            {sending ? (
              <ActivityIndicator color={resolveThemeColor("#10150B", "color")} size="small" />
            ) : (
              <Ionicons
                name="arrow-redo-outline"
                size={17}
                color={resolveThemeColor("#10150B", "color")}
              />
            )}
            <Text style={lumoStyles.sendButtonText}>
              {sending
                ? 'Sending...'
                : `Forward to ${selectedTargetKeys.length} ${selectedTargetKeys.length === 1 ? 'chat' : 'chats'}`}
            </Text>
          </Pressable>


        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    height: '92%',
    maxHeight: '92%',
    flexShrink: 1,
    backgroundColor: '#0D100C',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#30372B',
    padding: 16,
  },
  topBar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 17,
    gap: 14,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: '#B9C7D6',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  title: {
    color: '#F2F5F7',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#9AA5B2',
    fontSize: 11,
    marginTop: 5,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1F17',
    borderWidth: 1,
    borderColor: '#30372B',
  },
  preview: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#171C13',
    borderWidth: 1,
    borderColor: '#2C3424',
    marginBottom: 0,
  },
  previewText: {
    flex: 1,
    color: '#DCE2D4',
    fontSize: 12,
    lineHeight: 17,
  },
  tabs: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#1A2029',
    borderWidth: 1,
    borderColor: '#2B3440',
    gap: 4,
  },
  tab: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  tabActive: { backgroundColor: '#B9C7D6' },
  tabText: {
    color: '#9AA5B2',
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextActive: { color: '#10150B' },
  searchWrap: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: '#151912',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#2B3440',
    marginTop: 13,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: '#F2F5F7',
    fontSize: 12,
    paddingVertical: 9,
    outlineStyle: 'none' as any,
  },
  targetList: { flex: 1, minHeight: 0 },
  targetRow: {
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#22281E',
  },
  targetPressed: { backgroundColor: '#1A2114' },
  targetSelected: {
    backgroundColor: '#1B2813',
    borderBottomColor: '#3B4E27',
  },
  targetDisabled: { opacity: 0.45 },
  sendButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 13,
    borderRadius: 12,
    backgroundColor: '#B9C7D6',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendButtonText: {
    color: '#10150B',
    fontSize: 12,
    fontWeight: '900',
  },
  targetIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: '#242D19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetCopy: { flex: 1, minWidth: 0 },
  targetName: {
    color: '#F2F5F7',
    fontSize: 12,
    fontWeight: '700',
  },
  targetSubtitle: {
    color: '#9AA5B2',
    fontSize: 10,
    marginTop: 4,
  },
  state: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    padding: 18,
  },
  stateText: {
    color: '#9AA5B2',
    fontSize: 11,
    textAlign: 'center',
  },
  error: {
    color: '#FF8494',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  footnote: {
    color: '#697263',
    textAlign: 'center',
    fontSize: 9,
    marginTop: 13,
  },
});
