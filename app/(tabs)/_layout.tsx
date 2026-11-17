import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type ActivityNotification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'message' | 'story';
  post_id: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
  actor: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
  post: {
    id: string;
    image_url: string | null;
  } | null;
  comment: {
    id: string;
    body: string;
  } | null;
};

const notificationIcons: Record<ActivityNotification['type'], IconName> = {
  like: 'heart',
  comment: 'chatbubble',
  follow: 'person-add',
  mention: 'at',
  message: 'mail',
  story: 'images',
};

function icon(active: IconName, inactive: IconName) {
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? active : inactive} size={25} color={color} />
  );
}

function CenterCreateIcon() {
  return (
    <View style={styles.createButton}>
      <Ionicons name="add" size={30} color={colors.bg} />
    </View>
  );
}

function BrandTitle() {
  return (
    <View style={styles.brandTitle}>
      <Image
        source={require('../../assets/lumo-mark.png')}
        style={styles.brandMark}
        contentFit="contain"
      />
      <Text style={styles.brandText}>Lumo</Text>
    </View>
  );
}

function getRelativeTime(iso: string) {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
}

type DateGroup = 'TODAY' | 'YESTERDAY' | 'EARLIER';
type NotificationFilter = 'all' | 'like' | 'comment' | 'follow';

const notificationFilters: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'like', label: 'Likes' },
  { key: 'comment', label: 'Comments' },
  { key: 'follow', label: 'Follows' },
];

const emptyFilterLabels: Record<NotificationFilter, string> = {
  all: 'No activity yet.',
  like: 'No likes yet.',
  comment: 'No comments yet.',
  follow: 'No new followers yet.',
};


function getDateGroup(iso: string): DateGroup {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'EARLIER';

  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'TODAY';
  if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
  return 'EARLIER';
}

function getNotificationAction(item: ActivityNotification) {
  switch (item.type) {
    case 'like':
      return ' liked your photo';
    case 'comment': {
      const body = item.comment?.body?.trim();
      if (!body) return ' commented on your photo';
      const preview = body.length > 65 ? `${body.slice(0, 65)}...` : body;
      return ` commented: “${preview}”`;
    }
    case 'follow':
      return ' started following you';
    case 'mention':
      return ' mentioned you';
    case 'message':
      return ' sent you a message';
    case 'story':
      return ' reacted to your story';
    default:
      return ' interacted with you';
  }
}

let notificationChannelSequence = 0;

const appNavigation: { label: string; path: string; icon: IconName; section: 'main' | 'more' }[] = [
  { label: 'Home', path: '/', icon: 'home-outline', section: 'main' },
  { label: 'Video', path: '/video', icon: 'play-circle-outline', section: 'main' },
  { label: 'Connect', path: '/messages', icon: 'chatbubbles-outline', section: 'main' },
  { label: 'Spaces', path: '/spaces', icon: 'people-circle-outline', section: 'main' },
  { label: 'Search', path: '/search', icon: 'search-outline', section: 'main' },
  { label: 'Market', path: '/market', icon: 'storefront-outline', section: 'more' },
  { label: 'Map', path: '/map', icon: 'map-outline', section: 'more' },
  { label: 'Studio', path: '/studio', icon: 'bar-chart-outline', section: 'more' },
  { label: 'Events', path: '/events', icon: 'calendar-outline', section: 'more' },
  { label: 'Mini Apps', path: '/mini-apps', icon: 'apps-outline', section: 'more' },
  { label: 'Live', path: '/live', icon: 'radio-outline', section: 'more' },
  { label: 'Wallet', path: '/wallet', icon: 'wallet-outline', section: 'more' },
  { label: 'Profile', path: '/profile', icon: 'person-circle-outline', section: 'more' },
];

export default function TabsLayout() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktop = windowWidth >= 1040;
  const isTablet = windowWidth >= 760;
  const notifSheetMaxHeight = Math.min(
    windowHeight * (isDesktop ? 0.84 : 0.9),
    isDesktop ? 760 : 760,
  );

  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();
  const me = session?.user?.id;

  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [modulesVisible, setModulesVisible] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [activeNotificationFilter, setActiveNotificationFilter] =
    useState<NotificationFilter>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!me) return;

    setNotificationsLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          user_id,
          actor_id,
          type,
          post_id,
          comment_id,
          is_read,
          created_at,
          actor:profiles!notifications_actor_id_fkey (
            id,
            username,
            avatar_url
          ),
          post:posts!notifications_post_id_fkey (
            id,
            image_url
          ),
          comment:comments!notifications_comment_id_fkey (
            id,
            body
          )
        `)
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []) as unknown as ActivityNotification[];
      setNotifications(rows);
      setUnreadNotifications(rows.filter((item) => !item.is_read).length);
      setNotificationsError(null);
    } catch (error) {
      setNotificationsError(
        error instanceof Error ? error.message : 'Could not load notifications.',
      );
    } finally {
      setNotificationsLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (!me) {
      setUnreadMessages(0);
      setUnreadNotifications(0);
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }

    let active = true;

    const countUnreadMessages = async () => {
      try {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', me)
          .is('read_at', null);

        if (!error && active && count != null) {
          setUnreadMessages(count);
        }
      } catch {
        // Keep the current count if the request fails.
      }
    };

    void loadNotifications();
    void countUnreadMessages();

    const interval = setInterval(countUnreadMessages, 15000);
    const channel = supabase
      .channel(`notifications:${me}:${++notificationChannelSequence}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${me}`,
        },
        () => {
          void loadNotifications();
        },
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [me, loadNotifications]);

  const openNotifications = () => {
    setNotificationsVisible(true);
    setNotificationsError(null);
    if (me && notifications.length === 0) void loadNotifications();
  };

  const markAllNotificationsRead = async () => {
    if (!me || unreadNotifications === 0 || markingAllRead) return;

    setMarkingAllRead(true);
    setNotificationsError(null);

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', me)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: true })),
      );
      setUnreadNotifications(0);
    } catch (error) {
      setNotificationsError(
        error instanceof Error ? error.message : 'Could not update notifications.',
      );
    } finally {
      setMarkingAllRead(false);
    }
  };

  const markNotificationRead = (item: ActivityNotification) => {
    if (!me || item.is_read) return;

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id
          ? { ...notification, is_read: true }
          : notification,
      ),
    );
    setUnreadNotifications((current) => Math.max(0, current - 1));

    void supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', item.id)
      .eq('user_id', me)
      .then(({ error }) => {
        if (error) {
          setNotificationsError(error.message);
          void loadNotifications();
        }
      });
  };

  const openNotification = (item: ActivityNotification) => {
    markNotificationRead(item);
    setNotificationsVisible(false);

    if (item.post_id) {
      router.push(`/post/${item.post_id}`);
      return;
    }

    if (item.actor_id) {
      router.push(item.actor_id === me ? '/profile' : `/user/${item.actor_id}`);
    }
  };

  const visibleNotifications = notifications.filter((item) =>
    activeNotificationFilter === 'all'
      ? true
      : item.type === activeNotificationFilter,
  );

  const navigateTo = (path: string) => {
    setModulesVisible(false);
    router.push(path as never);
  };

  const activePath = pathname === '/(tabs)' || pathname === '/(tabs)/index' ? '/' : pathname;

  return (
    <>
      <View style={styles.appFrame}>
        {isTablet ? (
          <View style={[styles.sidebar, !isDesktop && styles.sidebarCompact]}>
            <Pressable style={styles.sidebarBrand} onPress={() => navigateTo('/')} accessibilityRole="button" accessibilityLabel="Lumo home">
              <Image source={require('../../assets/lumo-mark.png')} style={styles.sidebarMark} contentFit="contain" />
              {isDesktop ? <Text style={styles.sidebarBrandText}>Lumo</Text> : null}
            </Pressable>
            <ScrollView contentContainerStyle={styles.sidebarScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.sidebarSection}>{isDesktop ? 'YOUR SPACE' : ''}</Text>
              {appNavigation.filter((item) => item.section === 'main').map((item) => {
                const selected = activePath === item.path || (item.path === '/' && activePath === '/');
                return (
                  <Pressable key={item.label} onPress={() => navigateTo(item.path)} style={[styles.sidebarItem, selected && styles.sidebarItemSelected]} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }}>
                    <Ionicons name={item.icon} size={20} color={selected ? colors.accentStrong : colors.muted} />
                    {isDesktop ? <Text style={[styles.sidebarLabel, selected && styles.sidebarLabelSelected]}>{item.label}</Text> : null}
                  </Pressable>
                );
              })}
              <Text style={styles.sidebarSection}>{isDesktop ? 'MORE FROM LUMO' : ''}</Text>
              {appNavigation.filter((item) => item.section === 'more').map((item) => {
                const selected = activePath === item.path;
                return (
                  <Pressable key={item.label} onPress={() => navigateTo(item.path)} style={[styles.sidebarItem, selected && styles.sidebarItemSelected]} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected }}>
                    <Ionicons name={item.icon} size={20} color={selected ? colors.accentStrong : colors.muted} />
                    {isDesktop ? <Text style={[styles.sidebarLabel, selected && styles.sidebarLabelSelected]}>{item.label}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={[styles.sidebarCreate, !isDesktop && styles.sidebarCreateCompact]} onPress={() => navigateTo('/create')} accessibilityRole="button" accessibilityLabel="Create a post">
              <Ionicons name="add" size={21} color={colors.bg} />
              {isDesktop ? <Text style={styles.sidebarCreateText}>Create</Text> : null}
            </Pressable>
          </View>
        ) : null}
        <View style={styles.tabsColumn}>
      <Tabs
        screenOptions={{
          tabBarShowLabel: false,
          tabBarActiveTintColor: colors.accentStrong,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            display: isTablet ? 'none' : 'flex',
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 8,
          },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: {
            fontWeight: '900',
            color: colors.text,
            fontSize: 24,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Lumo',
            headerTitle: () => <BrandTitle />,
            headerRight: () => (
              <View style={styles.headerRight}>
                {!isTablet ? (
                  <Pressable
                    onPress={() => setModulesVisible(true)}
                    style={styles.headerIconBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Open Lumo modules"
                  >
                    <Ionicons name="apps-outline" size={23} color={colors.text} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => router.push('/create')}
                  style={styles.headerIconBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Create post"
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.text} />
                </Pressable>

                <Pressable
                  onPress={() => void openNotifications()}
                  style={styles.headerIconBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Ionicons name="notifications-outline" size={24} color={colors.text} />
                  {unreadNotifications > 0 && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationBadgeText}>
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            ),
            tabBarIcon: icon('home', 'home-outline'),
          }}
        />

        <Tabs.Screen
          name="search"
          options={{
            title: 'Discover',
            tabBarIcon: icon('search', 'search-outline'),
          }}
        />

        <Tabs.Screen
          name="create"
          options={{
            title: '',
            tabBarLabel: () => null,
            tabBarIcon: () => <CenterCreateIcon />,
          }}
        />

        <Tabs.Screen
          name="messages"
          options={{
            title: 'Messages',
            headerShown: false,
            tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
            tabBarBadgeStyle: {
              backgroundColor: colors.lime,
              color: colors.bg,
              fontSize: 10,
              fontWeight: '900',
              minWidth: 18,
              height: 18,
            },
            tabBarIcon: icon('chatbubble-ellipses', 'chatbubble-ellipses-outline'),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: icon('person', 'person-outline'),
          }}
        />
        <Tabs.Screen name="video" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="spaces" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="market" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="map" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="studio" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="events" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="mini-apps" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="live" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="wallet" options={{ href: null, headerShown: false }} />
      </Tabs>
        </View>
      </View>

      <Modal
        visible={modulesVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModulesVisible(false)}
      >
        <View style={styles.moduleOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModulesVisible(false)} accessibilityRole="button" accessibilityLabel="Close modules" />
          <View style={styles.moduleSheet}>
            <View style={styles.moduleSheetHeader}>
              <View><Text style={styles.moduleSheetEyebrow}>LUMO ECOSYSTEM</Text><Text style={styles.moduleSheetTitle}>Explore modules</Text></View>
              <Pressable style={styles.sheetCloseBtn} onPress={() => setModulesVisible(false)} accessibilityRole="button" accessibilityLabel="Close modules"><Ionicons name="close" size={20} color={colors.text} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.moduleGrid}>
              {appNavigation.filter((item) => item.path !== '/').map((item) => (
                <Pressable key={item.path} onPress={() => navigateTo(item.path)} style={styles.moduleGridItem} accessibilityRole="button">
                  <View style={styles.moduleGridIcon}><Ionicons name={item.icon} size={21} color={colors.accentStrong} /></View>
                  <Text style={styles.moduleGridLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={notificationsVisible}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View
          style={[
            styles.notifOverlay,
            isDesktop && styles.notifOverlayDesktop,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setNotificationsVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
          />

          <View
            style={[
              styles.notifSheet,
              isDesktop && styles.notifSheetDesktop,
              { maxHeight: notifSheetMaxHeight },
            ]}
          >
            {!isDesktop && <View style={styles.sheetHandle} />}

            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Activity</Text>
              <View style={styles.sheetHeaderActions}>
                {unreadNotifications > 0 && (
                  <Pressable
                    onPress={() => void markAllNotificationsRead()}
                    disabled={markingAllRead}
                    hitSlop={8}
                    style={styles.markAllReadButton}
                    accessibilityRole="button"
                    accessibilityLabel="Mark all notifications as read"
                  >
                    {markingAllRead ? (
                      <ActivityIndicator color={colors.lime} size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-done-outline"
                          size={14}
                          color={colors.lime}
                        />
                        <Text style={styles.markAllReadText}>Mark all read</Text>
                      </>
                    )}
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setNotificationsVisible(false)}
                  hitSlop={10}
                  style={styles.sheetCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close Activity"
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.filterTabs} accessibilityLabel="Notification categories">
              {notificationFilters.map((filter) => {
                const selected = activeNotificationFilter === filter.key;

                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setActiveNotificationFilter(filter.key)}
                    style={styles.filterTab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        selected && styles.filterTabTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                    {selected && <View style={styles.filterTabIndicator} />}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              style={styles.notifScroll}
              contentContainerStyle={styles.notifList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {notificationsLoading ? (
                <View style={styles.notifEmpty}>
                  <ActivityIndicator color={colors.lime} size="small" />
                </View>
              ) : visibleNotifications.length === 0 ? (
                <View style={styles.notifEmpty}>
                  <Text style={styles.notifEmptyText}>
                    {emptyFilterLabels[activeNotificationFilter]}
                  </Text>
                </View>
              ) : (
                <>
                  {(['TODAY', 'YESTERDAY', 'EARLIER'] as const).map((group) => {
                    const items = visibleNotifications.filter(
                      (item) => getDateGroup(item.created_at) === group,
                    );

                    if (items.length === 0) return null;

                    return (
                      <View key={group} style={styles.notifGroup}>
                        <View style={styles.notifDateHeader}>
                          <Text style={styles.notifSectionTitle}>{group}</Text>
                          <View style={styles.notifDateLine} />
                        </View>

                        {items.map((item) => {
                          const actorName = item.actor?.username ?? 'Someone';
                          const iconName = notificationIcons[item.type];
                          const postImage = item.post?.image_url;

                          return (
                            <Pressable
                              key={item.id}
                              onPress={() => openNotification(item)}
                              accessibilityRole="button"
                              accessibilityLabel={`${actorName}${getNotificationAction(item)}, ${getRelativeTime(item.created_at)}`}
                              style={({ pressed }) => [
                                styles.notifRow,
                                pressed && styles.notifRowPressed,
                              ]}
                            >
                              <View style={styles.notifAvatarWrap}>
                                <Avatar
                                  uri={item.actor?.avatar_url}
                                  name={actorName}
                                  size={40}
                                />

                                {!item.is_read && <View style={styles.notifUnreadDot} />}

                                {!postImage && (
                                  <View style={styles.notifTypeBadge}>
                                    <Ionicons
                                      name={iconName}
                                      size={10}
                                      color={item.type === 'like' ? colors.like : colors.muted}
                                    />
                                  </View>
                                )}
                              </View>

                              <View style={styles.notifMessage}>
                                <Text style={styles.notifText} numberOfLines={2}>
                                  <Text style={styles.notifBold}>{actorName}</Text>
                                  <Text
                                    style={[
                                      styles.notifAction,
                                      !item.is_read && styles.notifActionUnread,
                                    ]}
                                  >
                                    {getNotificationAction(item)}
                                  </Text>
                                </Text>

                                {item.type === 'mention' && item.comment?.body?.trim() ? (
                                  <Text style={styles.notifContext} numberOfLines={1}>
                                    {item.comment.body.trim()}
                                  </Text>
                                ) : null}

                                <Text style={styles.notifTime}>
                                  {getRelativeTime(item.created_at)}
                                </Text>
                              </View>

                              {postImage ? (
                                <Image
                                  source={{ uri: postImage }}
                                  style={styles.notifThumbnail}
                                  contentFit="cover"
                                  transition={120}
                                />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })}
                </>
              )}

              {notificationsError ? (
                <Text style={styles.notifError}>{notificationsError}</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  tabsColumn: { flex: 1, minWidth: 0 },
  sidebar: {
    width: 236,
    paddingTop: 20,
    paddingHorizontal: 13,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  sidebarCompact: { width: 76, alignItems: 'center', paddingHorizontal: 9 },
  sidebarBrand: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 24 },
  sidebarMark: { width: 29, height: 29 },
  sidebarBrandText: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.5 },
  sidebarScroll: { gap: 5, paddingBottom: 16, width: '100%' },
  sidebarSection: { color: colors.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginTop: 15, marginBottom: 7, paddingHorizontal: 10, minHeight: 10 },
  sidebarItem: { minHeight: 44, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 12 },
  sidebarItemSelected: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.glassBorder },
  sidebarLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  sidebarLabelSelected: { color: colors.text, fontWeight: '700' },
  sidebarCreate: { minHeight: 44, borderRadius: 14, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingHorizontal: 12 },
  sidebarCreateCompact: { width: 46, height: 46, borderRadius: 16 },
  sidebarCreateText: { color: colors.bg, fontSize: 13, fontWeight: '800' },
  moduleOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  moduleSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '78%' },
  moduleSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  moduleSheetEyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  moduleSheetTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 4 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleGridItem: { width: '31%', minWidth: 86, minHeight: 84, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  moduleGridIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  moduleGridLabel: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  brandTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 26,
    height: 26,
  },
  brandText: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginRight: 16,
  },
  headerIconBtn: {
    padding: 2,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.like,
    borderWidth: 1.5,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  createButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.lime,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 4,
  },
  notifOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  notifOverlayDesktop: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  notifSheet: {
    width: '100%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 7,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  notifSheetDesktop: {
    width: '100%',
    maxWidth: 620,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 7,
  },
  sheetTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.55,
    color: colors.text,
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.surfaceRaised,
  },
  sheetHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markAllReadButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  markAllReadText: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
  filterTabs: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 9,
  },
  filterTab: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.05,
  },
  filterTabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  filterTabIndicator: {
    position: 'absolute',
    left: '25%',
    right: '25%',
    bottom: -1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.lime,
  },
  notifScroll: {
    flexShrink: 1,
  },
  notifList: {
    paddingTop: 1,
    paddingBottom: 5,
  },
  notifGroup: {
    marginBottom: 12,
  },
  notifDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 24,
    marginBottom: 3,
  },
  notifSectionTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  notifDateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  notifRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 6,
  },
  notifRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  notifAvatarWrap: {
    width: 40,
    height: 40,
    position: 'relative',
    flexShrink: 0,
  },
  notifUnreadDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  notifTypeBadge: {
    position: 'absolute',
    right: -3,
    bottom: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifMessage: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  notifText: {
    color: colors.text,
    fontSize: 13.5,
    lineHeight: 18,
  },
  notifBold: {
    color: colors.text,
    fontWeight: '700',
  },
  notifAction: {
    color: colors.muted,
    fontWeight: '400',
  },
  notifActionUnread: {
    color: colors.text,
  },
  notifContext: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 15,
  },
  notifTime: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  notifThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
    flexShrink: 0,
  },
  notifEmpty: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  notifEmptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  notifError: {
    color: colors.like,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 5,
    paddingVertical: 8,
  },
});
