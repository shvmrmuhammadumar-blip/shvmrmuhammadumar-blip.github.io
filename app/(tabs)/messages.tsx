import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/api';
import type { Message, MiniProfile } from '../../lib/types';
import { getMyGroups, type GroupSummary } from '../../lib/groups';
import { getMyChannels, type ChannelSummary } from '../../lib/channels';
import { useThemedStyles } from "../../lib/theme-styles";
import { colors } from '../../lib/theme';

type MessageCategory = 'Everything' | 'Personal' | 'Groups' | 'Channels';
type Conversation = {
  userId: string;
  profile: MiniProfile | null;
  last: Message;
  unreadCount: number;
  category: 'Personal';
};
type EverythingItem =
  | { kind: 'personal'; id: string; updatedAt: string; conversation: Conversation }
  | { kind: 'group'; id: string; updatedAt: string; group: GroupSummary }
  | { kind: 'channel'; id: string; updatedAt: string; channel: ChannelSummary };

type Preview = {
  icon: React.ComponentProps<typeof Ionicons>['name'] | null;
  text: string;
};
type SortMode = 'recent' | 'unread';

const palette = {
  get canvas() { return colors.bg; },
  get surface() { return colors.surface; },
  get raised() { return colors.surfaceRaised; },
  get ink() { return colors.text; },
  get muted() { return colors.muted; },
  get dim() { return colors.dim; },
  get line() { return colors.border; },
  get lime() { return colors.accent; },
  get limeSoft() { return colors.accentDark; },
  get danger() { return colors.danger; },
};

const MESSAGE_WITH_FILE_NAME_SELECT =
  'id, sender_id, receiver_id, body, created_at, read_at, message_type, media_path, media_mime_type, media_file_name';
const EXTENDED_MESSAGE_SELECT =
  'id, sender_id, receiver_id, body, created_at, read_at, message_type, media_path, media_mime_type';
const BASIC_MESSAGE_SELECT = 'id, sender_id, receiver_id, body, created_at';

const CATEGORIES: MessageCategory[] = [
  'Everything',
  'Personal',
  'Groups',
  'Channels',
];

function previewOf(message: Message): Preview {
  const body = message.body?.trim();
  if (body) return { icon: null, text: body };

  switch (message.message_type) {
    case 'video':
      return { icon: 'videocam-outline', text: 'Video' };
    case 'image':
      return { icon: 'image-outline', text: 'Photo' };
    case 'audio':
      return { icon: 'musical-notes-outline', text: 'Audio' };
    case 'file':
      return {
        icon: 'document-outline',
        text: message.media_file_name || 'File',
      };
    default:
      return { icon: null, text: 'Message' };
  }
}

function safeTimeAgo(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  return timeAgo(value);
}

function MessageRow({
  item,
  me,
  onPress,
}: {
  item: Conversation;
  me: string;
  onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  const preview = previewOf(item.last);
  const unread = item.unreadCount > 0;
  const mine = item.last.sender_id === me;
  const username = item.profile?.username ?? 'Unknown user';

  return (
    <Pressable
      style={({ pressed }) => [lumoStyles.row, pressed && lumoStyles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${username}${unread ? `, ${item.unreadCount} unread messages` : ''}`}
    >
      <View style={lumoStyles.avatarWrap}>
        <Avatar
          uri={item.profile?.avatar_url}
          name={item.profile?.username ?? 'User'}
          size={50}
        />
        {unread ? <View style={lumoStyles.avatarUnreadDot} /> : null}
      </View>

      <View style={lumoStyles.rowContent}>
        <View style={lumoStyles.rowHeading}>
          <Text
            style={[lumoStyles.username, unread && lumoStyles.usernameUnread]}
            numberOfLines={1}
          >
            {username}
          </Text>
          <Text style={[lumoStyles.timestamp, unread && lumoStyles.timestampUnread]}>
            {safeTimeAgo(item.last.created_at)}
          </Text>
        </View>

        <View style={lumoStyles.previewRow}>
          {mine ? (
            <Ionicons
              name={item.last.read_at ? 'checkmark-done' : 'checkmark'}
              size={15}
              color={item.last.read_at ? palette.lime : palette.dim}
              style={lumoStyles.deliveryIcon}
            />
          ) : null}
          {preview.icon ? (
            <Ionicons
              name={preview.icon}
              size={15}
              color={palette.muted}
              style={lumoStyles.previewIcon}
            />
          ) : null}
          <Text
            style={[lumoStyles.previewText, unread && lumoStyles.previewTextUnread]}
            numberOfLines={1}
          >
            {mine && !preview.icon ? 'You: ' : ''}
            {preview.text}
          </Text>
          {unread ? (
            <View style={lumoStyles.unreadCount}>
              <Text style={lumoStyles.unreadCountText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function Messages() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const me = session?.user?.id;
  const router = useRouter();
  const { category: requestedCategory } = useLocalSearchParams<{ category?: string }>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MessageCategory>(
    requestedCategory === 'Channels' ? 'Channels' : 'Everything',
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  useEffect(() => {
    if (requestedCategory === 'Channels') setCategory('Channels');
  }, [requestedCategory]);

  const load = useCallback(async () => {
    if (!me) {
      setItems([]);
      setLoading(false);
      return;
    }

    const createQuery = (selection: string) =>
      supabase
        .from('messages')
        .select(selection)
        .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
        .order('created_at', { ascending: false })
        .limit(500);

    let hasReadReceipts = true;
    let { data, error } = await createQuery(MESSAGE_WITH_FILE_NAME_SELECT);

    if (error?.code === '42703') {
      ({ data, error } = await createQuery(EXTENDED_MESSAGE_SELECT));
    }

    if (error?.code === '42703') {
      hasReadReceipts = false;
      ({ data, error } = await createQuery(BASIC_MESSAGE_SELECT));
    }

    if (error) throw error;

    const latest = new Map<string, Message>();
    const unreadCounts = new Map<string, number>();

    for (const message of (data as Message[] | null) ?? []) {
      const otherUserId =
        message.sender_id === me ? message.receiver_id : message.sender_id;

      if (!latest.has(otherUserId)) latest.set(otherUserId, message);

      if (
        hasReadReceipts &&
        message.receiver_id === me &&
        !message.read_at
      ) {
        unreadCounts.set(
          otherUserId,
          (unreadCounts.get(otherUserId) ?? 0) + 1,
        );
      }
    }

    const userIds = [...latest.keys()];
    let profiles = new Map<string, MiniProfile>();

    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', userIds);

      if (profileError) throw profileError;

      profiles = new Map(
        (profileRows ?? []).map((profile) => [
          profile.id,
          {
            id: profile.id,
            username: profile.username,
            avatar_url: profile.avatar_url,
          } as MiniProfile,
        ]),
      );
    }

    const conversations: Conversation[] = [...latest.entries()].map(
      ([userId, last]) => ({
        userId,
        last,
        profile: profiles.get(userId) ?? null,
        unreadCount: unreadCounts.get(userId) ?? 0,
        category: 'Personal',
      }),
    );

    setItems(conversations);
    setLoadError('');
  }, [me]);

  const loadGroups = useCallback(async () => {
    if (!me) {
      setGroups([]);
      return;
    }

    setCommunityLoading(true);
    setCommunityError('');

    try {
      setGroups(await getMyGroups(me));
    } catch (error) {
      setCommunityError(error instanceof Error ? error.message : 'Could not load groups.');
    } finally {
      setCommunityLoading(false);
    }
  }, [me]);

  const loadChannels = useCallback(async () => {
    if (!me) {
      setChannels([]);
      return;
    }

    setCommunityLoading(true);
    setCommunityError('');

    try {
      setChannels(await getMyChannels(me));
    } catch (error) {
      setCommunityError(error instanceof Error ? error.message : 'Could not load channels.');
    } finally {
      setCommunityLoading(false);
    }
  }, [me]);

  const reload = useCallback(async () => {
    try {
      await load();
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load messages. Please try again.',
      );
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refresh = async () => {
        setLoading(true);
        try {
          await load();
        } catch (error) {
          if (active) {
            setLoadError(
              error instanceof Error
                ? error.message
                : 'Could not load messages. Please try again.',
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      };

      void refresh();

      if (!me) {
        return () => {
          active = false;
        };
      }

      const channel = supabase
        .channel(`messages-list-${me}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${me}`,
          },
          () => {
            if (active) void refresh();
          },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${me}`,
          },
          () => {
            if (active) void refresh();
          },
        )
        .subscribe();

      return () => {
        active = false;
        void supabase.removeChannel(channel);
      };
    }, [load, me]),
  );

  useFocusEffect(
    useCallback(() => {
      if (category === 'Groups') void loadGroups();
      else if (category === 'Channels') void loadChannels();
      else if (category === 'Everything') {
        void Promise.all([loadGroups(), loadChannels()]);
      }
    }, [category, loadGroups, loadChannels]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (category === 'Groups') await loadGroups();
      else if (category === 'Channels') await loadChannels();
      else if (category === 'Everything') {
        await Promise.all([reload(), loadGroups(), loadChannels()]);
      } else await reload();
    } finally {
      setRefreshing(false);
    }
  }, [category, loadGroups, loadChannels, reload]);

  const totalUnread = useMemo(
    () => items.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    [items],
  );

  const categoryItems = useMemo(() => {
    if (category === 'Groups' || category === 'Channels') return [];
    if (category === 'Personal') {
      return items.filter((conversation) => conversation.category === 'Personal');
    }
    return items;
  }, [category, items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = categoryItems.filter((conversation) => {
      if (unreadOnly && conversation.unreadCount === 0) return false;
      if (!q) return true;

      const preview = previewOf(conversation.last).text;
      const username = conversation.profile?.username ?? '';
      return `${username} ${preview}`.toLowerCase().includes(q);
    });

    if (sortMode === 'unread') {
      result = [...result].sort((a, b) => {
        if (a.unreadCount !== b.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        return (
          new Date(b.last.created_at).getTime() -
          new Date(a.last.created_at).getTime()
        );
      });
    }

    return result;
  }, [categoryItems, query, sortMode, unreadOnly]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((group) =>
      !q || `${group.name} ${group.description ?? ''}`.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const visibleChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((channel) =>
      !q ||
      `${channel.name} ${channel.username} ${channel.description ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [channels, query]);

  const everythingItems = useMemo<EverythingItem[]>(() => {
    const rows: EverythingItem[] = [
      ...visible.map((conversation) => ({
        kind: 'personal' as const,
        id: conversation.userId,
        updatedAt: conversation.last.created_at,
        conversation,
      })),
      ...(unreadOnly ? [] : visibleGroups.map((group) => ({
        kind: 'group' as const,
        id: group.id,
        updatedAt: group.updated_at ?? '',
        group,
      }))),
      ...(unreadOnly ? [] : visibleChannels.map((channel) => ({
        kind: 'channel' as const,
        id: channel.id,
        updatedAt: channel.updated_at ?? '',
        channel,
      }))),
    ];

    return rows.sort((a, b) => {
      if (sortMode === 'unread') {
        const aUnread = a.kind === 'personal' ? a.conversation.unreadCount : 0;
        const bUnread = b.kind === 'personal' ? b.conversation.unreadCount : 0;
        if (aUnread !== bUnread) return bUnread - aUnread;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [visible, visibleGroups, visibleChannels, unreadOnly, sortMode]);

  const categoryIsCommunity = category === 'Groups' || category === 'Channels';

  return (
    <View style={[lumoStyles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={lumoStyles.header}>
        <View style={lumoStyles.headerTitleWrap}>
          <Text style={lumoStyles.title}>Messages</Text>
          <Text style={lumoStyles.subtitle}>Your conversations</Text>
        </View>
        <View style={lumoStyles.headerActions}>
          {!categoryIsCommunity && totalUnread > 0 ? (
            <View style={lumoStyles.unreadSummary}>
              <View style={lumoStyles.unreadSummaryDot} />
              <Text style={lumoStyles.unreadSummaryText}>
                {totalUnread > 99 ? '99+' : totalUnread} unread
              </Text>
            </View>
          ) : null}
          <Pressable
            style={lumoStyles.newChatButton}
            onPress={() => {
              if (category === 'Groups') router.push('/groups/create');
              else if (category === 'Channels') router.push('/channels/create');
              else router.push('/(tabs)/search');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              category === 'Groups'
                ? 'Create group'
                : category === 'Channels'
                  ? 'Create channel'
                  : 'Start a new chat'
            }
          >
            <Ionicons name="create-outline" size={22} color={palette.ink} />
          </Pressable>
        </View>
      </View>

      <View style={lumoStyles.searchBar}>
        <Ionicons name="search-outline" size={18} color={palette.muted} />
        <TextInput
          style={lumoStyles.searchInput}
          placeholder={
            category === 'Groups'
              ? 'Search groups'
              : category === 'Channels'
                ? 'Search channels'
                : 'Search conversations'
          }
          placeholderTextColor={palette.dim}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search conversations"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>

      <View style={lumoStyles.categoryRow}>
        {CATEGORIES.map((tab) => {
          const active = category === tab;
          return (
            <Pressable
              key={tab}
              onPress={() => {
                setCategory(tab);
                setQuery('');
                setUnreadOnly(false);
              }}
              style={lumoStyles.categoryButton}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  lumoStyles.categoryText,
                  active && lumoStyles.categoryTextActive,
                ]}
              >
                {tab}
              </Text>
              {active ? <View style={lumoStyles.categoryIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={[lumoStyles.listTools, categoryIsCommunity && { display: 'none' }]}>
        <Pressable
          onPress={() => setUnreadOnly((current) => !current)}
          style={[
            lumoStyles.unreadFilter,
            unreadOnly && lumoStyles.unreadFilterActive,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: unreadOnly }}
        >
          <View
            style={[
              lumoStyles.unreadFilterDot,
              unreadOnly && lumoStyles.unreadFilterDotActive,
            ]}
          />
          <Text
            style={[
              lumoStyles.unreadFilterText,
              unreadOnly && lumoStyles.unreadFilterTextActive,
            ]}
          >
            Unread
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            setSortMode((current) =>
              current === 'recent' ? 'unread' : 'recent',
            )
          }
          style={lumoStyles.sortButton}
          accessibilityRole="button"
          accessibilityLabel={
            sortMode === 'recent' ? 'Sort unread first' : 'Sort by recent'
          }
        >
          <Ionicons
            name="swap-vertical-outline"
            size={15}
            color={palette.muted}
          />
          <Text style={lumoStyles.sortText}>
            {sortMode === 'recent' ? 'Recent' : 'Unread first'}
          </Text>
        </Pressable>
      </View>

      {!categoryIsCommunity && loadError && items.length > 0 ? (
        <Pressable style={lumoStyles.inlineError} onPress={() => void reload()}>
          <Text style={lumoStyles.inlineErrorText} numberOfLines={2}>
            {loadError}
          </Text>
          <Text style={lumoStyles.retryLink}>Retry</Text>
        </Pressable>
      ) : null}

      {category === 'Everything' ? (
        <FlatList
          data={everythingItems}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={[
            lumoStyles.listContent,
            { paddingBottom: Math.max(insets.bottom, 14) + 76 },
            everythingItems.length === 0 && lumoStyles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.lime}
              colors={[palette.lime]}
            />
          }
          renderItem={({ item }) => {
            if (item.kind === 'personal') {
              return (
                <MessageRow
                  item={item.conversation}
                  me={me ?? ''}
                  onPress={() => router.push(`/chat/${item.id}`)}
                />
              );
            }

            if (item.kind === 'group') {
              return (
                <Pressable
                  style={({ pressed }) => [lumoStyles.row, pressed && lumoStyles.rowPressed]}
                  onPress={() => router.push(`/groups/${item.id}`)}
                >
                  <View style={lumoStyles.avatarWrap}>
                    <Avatar uri={item.group.avatar_url} name={item.group.name} size={50} />
                  </View>
                  <View style={lumoStyles.rowContent}>
                    <View style={lumoStyles.rowHeading}>
                      <Text style={lumoStyles.username} numberOfLines={1}>{item.group.name}</Text>
                      <Text style={lumoStyles.timestamp}>{item.group.member_count} members</Text>
                    </View>
                    <Text style={lumoStyles.previewText} numberOfLines={1}>
                      {item.group.description?.trim() || `You are ${item.group.my_role}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={palette.dim} />
                </Pressable>
              );
            }

            return (
              <Pressable
                style={({ pressed }) => [lumoStyles.row, pressed && lumoStyles.rowPressed]}
                onPress={() => router.push(`/channels/${item.id}`)}
              >
                <View style={lumoStyles.avatarWrap}>
                  <Avatar uri={item.channel.avatar_url} name={item.channel.name} size={50} />
                </View>
                <View style={lumoStyles.rowContent}>
                  <View style={lumoStyles.rowHeading}>
                    <Text style={lumoStyles.username} numberOfLines={1}>{item.channel.name}</Text>
                    <Text style={lumoStyles.timestamp}>{item.channel.member_count} members</Text>
                  </View>
                  <Text style={lumoStyles.previewText} numberOfLines={1}>
                    @{item.channel.username}
                    {item.channel.description?.trim() ? ` · ${item.channel.description.trim()}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={palette.dim} />
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={lumoStyles.separator} />}
          ListEmptyComponent={
            loading || communityLoading ? (
              <View style={lumoStyles.loadingState}>
                <ActivityIndicator color={palette.lime} size="small" />
              </View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={25} color={palette.dim} />
                <Text style={lumoStyles.emptyTitle}>No conversations yet</Text>
                <Text style={lumoStyles.emptyDescription}>
                  Your personal chats, groups and channels will appear here.
                </Text>
              </View>
            )
          }
        />
      ) : category === 'Groups' ? (
        <FlatList
          data={visibleGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            lumoStyles.listContent,
            { paddingBottom: Math.max(insets.bottom, 14) + 76 },
            visibleGroups.length === 0 && lumoStyles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={palette.lime} colors={[palette.lime]} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [lumoStyles.row, pressed && lumoStyles.rowPressed]}
              onPress={() => router.push(`/groups/${item.id}`)}
            >
              <View style={lumoStyles.avatarWrap}>
                <Avatar uri={item.avatar_url} name={item.name} size={50} />
              </View>
              <View style={lumoStyles.rowContent}>
                <View style={lumoStyles.rowHeading}>
                  <Text style={lumoStyles.username} numberOfLines={1}>{item.name}</Text>
                  <Text style={lumoStyles.timestamp}>{item.member_count} members</Text>
                </View>
                <Text style={lumoStyles.previewText} numberOfLines={1}>
                  {item.description?.trim() || `You are ${item.my_role}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={palette.dim} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={lumoStyles.separator} />}
          ListEmptyComponent={
            communityLoading ? (
              <View style={lumoStyles.loadingState}>
                <ActivityIndicator color={palette.lime} size="small" />
              </View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <Ionicons name="people-outline" size={27} color={palette.dim} />
                <Text style={lumoStyles.emptyTitle}>
                  {communityError ? 'Groups unavailable' : query.trim() ? 'No groups found' : 'No groups yet'}
                </Text>
                <Text style={lumoStyles.emptyDescription}>
                  {communityError || (query.trim()
                    ? 'Try another group name.'
                    : 'Create a group and bring your conversations together.')}
                </Text>
                {communityError ? (
                  <Pressable onPress={() => void loadGroups()} style={lumoStyles.retryButton}>
                    <Text style={lumoStyles.retryButtonText}>Try again</Text>
                  </Pressable>
                ) : !query.trim() ? (
                  <Pressable onPress={() => router.push('/groups/create')} style={lumoStyles.retryButton}>
                    <Text style={lumoStyles.retryButtonText}>Create group</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
        />
      ) : category === 'Channels' ? (
        <FlatList
          data={visibleChannels}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            lumoStyles.listContent,
            { paddingBottom: Math.max(insets.bottom, 14) + 76 },
            visibleChannels.length === 0 && lumoStyles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={palette.lime} colors={[palette.lime]} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [lumoStyles.row, pressed && lumoStyles.rowPressed]}
              onPress={() => router.push(`/channels/${item.id}`)}
            >
              <View style={lumoStyles.avatarWrap}>
                <Avatar uri={item.avatar_url} name={item.name} size={50} />
              </View>
              <View style={lumoStyles.rowContent}>
                <View style={lumoStyles.rowHeading}>
                  <Text style={lumoStyles.username} numberOfLines={1}>{item.name}</Text>
                  <Text style={lumoStyles.timestamp}>{item.member_count} members</Text>
                </View>
                <Text style={lumoStyles.previewText} numberOfLines={1}>
                  @{item.username}
                  {item.description?.trim() ? ` · ${item.description.trim()}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={palette.dim} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={lumoStyles.separator} />}
          ListEmptyComponent={
            communityLoading ? (
              <View style={lumoStyles.loadingState}>
                <ActivityIndicator color={palette.lime} size="small" />
              </View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <Ionicons name="megaphone-outline" size={27} color={palette.dim} />
                <Text style={lumoStyles.emptyTitle}>
                  {communityError ? 'Channels unavailable' : query.trim() ? 'No channels found' : 'No channels yet'}
                </Text>
                <Text style={lumoStyles.emptyDescription}>
                  {communityError || (query.trim()
                    ? 'Try another channel name.'
                    : 'Create a channel to share updates with your channel members.')}
                </Text>
                {communityError ? (
                  <Pressable onPress={() => void loadChannels()} style={lumoStyles.retryButton}>
                    <Text style={lumoStyles.retryButtonText}>Try again</Text>
                  </Pressable>
                ) : !query.trim() ? (
                  <Pressable onPress={() => router.push('/channels/create')} style={lumoStyles.retryButton}>
                    <Text style={lumoStyles.retryButtonText}>Create channel</Text>
                  </Pressable>
                ) : null}
              </View>
            )
          }
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(conversation) => conversation.userId}
          contentContainerStyle={[
            lumoStyles.listContent,
            { paddingBottom: Math.max(insets.bottom, 14) + 76 },
            visible.length === 0 && lumoStyles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.lime}
              colors={[palette.lime]}
            />
          }
          renderItem={({ item }) => (
            <MessageRow
              item={item}
              me={me ?? ''}
              onPress={() => router.push(`/chat/${item.userId}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={lumoStyles.separator} />}
          ListEmptyComponent={
            loading ? (
              <View style={lumoStyles.loadingState}>
                <ActivityIndicator color={palette.lime} size="small" />
              </View>
            ) : loadError ? (
              <View style={lumoStyles.emptyState}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={24}
                  color={palette.dim}
                />
                <Text style={lumoStyles.emptyTitle}>Messages unavailable</Text>
                <Text style={lumoStyles.emptyDescription}>{loadError}</Text>
                <Pressable
                  onPress={() => void reload()}
                  style={lumoStyles.retryButton}
                >
                  <Text style={lumoStyles.retryButtonText}>Try again</Text>
                </Pressable>
              </View>
            ) : query.trim() ? (
              <View style={lumoStyles.emptyState}>
                <Ionicons
                  name="search-outline"
                  size={24}
                  color={palette.dim}
                />
                <Text style={lumoStyles.emptyTitle}>No results</Text>
                <Text style={lumoStyles.emptyDescription}>
                  Try another name or message.
                </Text>
              </View>
            ) : unreadOnly ? (
              <View style={lumoStyles.emptyState}>
                <Ionicons
                  name="checkmark-done-outline"
                  size={24}
                  color={palette.dim}
                />
                <Text style={lumoStyles.emptyTitle}>You are all caught up</Text>
                <Text style={lumoStyles.emptyDescription}>
                  There are no unread conversations in this list.
                </Text>
              </View>
            ) : (
              <View style={lumoStyles.emptyState}>
                <Ionicons
                  name="chatbubbles-outline"
                  size={25}
                  color={palette.dim}
                />
                <Text style={lumoStyles.emptyTitle}>No conversations yet</Text>
                <Text style={lumoStyles.emptyDescription}>
                  Start a conversation from someone’s profile.
                </Text>
                <Pressable
                  onPress={() => router.push('/(tabs)/search')}
                  style={lumoStyles.retryButton}
                >
                  <Text style={lumoStyles.retryButtonText}>Find people</Text>
                </Pressable>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 5,
    paddingBottom: 13,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: palette.ink,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: palette.dim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 12,
  },
  unreadSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadSummaryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.lime,
  },
  unreadSummaryText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  newChatButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 19,
    backgroundColor: palette.surface,
  },
  searchBar: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 13,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    fontSize: 13,
    paddingVertical: 0,
  },
  categoryRow: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  categoryButton: {
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  categoryText: {
    color: palette.dim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
  categoryTextActive: {
    color: palette.ink,
    fontWeight: '700',
  },
  categoryIndicator: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: -1,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.lime,
  },
  listTools: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  unreadFilter: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  unreadFilterActive: {
    opacity: 1,
  },
  unreadFilterDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.dim,
  },
  unreadFilterDotActive: {
    backgroundColor: palette.lime,
  },
  unreadFilterText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  unreadFilterTextActive: {
    color: palette.lime,
  },
  sortButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  sortText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 18,
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#211818',
    borderWidth: 1,
    borderColor: '#493030',
  },
  inlineErrorText: {
    flex: 1,
    color: '#EAB4B4',
    fontSize: 11,
    lineHeight: 15,
  },
  retryLink: {
    color: palette.lime,
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 18,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 11,
    paddingHorizontal: 2,
  },
  rowPressed: {
    opacity: 0.72,
  },
  avatarWrap: {
    width: 50,
    height: 50,
    position: 'relative',
    flexShrink: 0,
  },
  avatarUnreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.lime,
    borderWidth: 2,
    borderColor: palette.canvas,
  },
  rowContent: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  username: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
  },
  usernameUnread: {
    fontWeight: '700',
  },
  timestamp: {
    color: palette.dim,
    fontSize: 10,
    fontWeight: '500',
  },
  timestampUnread: {
    color: palette.lime,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  deliveryIcon: {
    marginRight: 1,
  },
  previewIcon: {
    marginRight: 1,
  },
  previewText: {
    flex: 1,
    minWidth: 0,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  previewTextUnread: {
    color: palette.ink,
    fontWeight: '600',
  },
  unreadCount: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.lime,
    marginLeft: 5,
  },
  unreadCountText: {
    color: palette.canvas,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginLeft: 63,
  },
  loadingState: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 50,
    gap: 10,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDescription: {
    maxWidth: 280,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 5,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: palette.lime,
  },
  retryButtonText: {
    color: palette.canvas,
    fontSize: 11,
    fontWeight: '800',
  },
});
