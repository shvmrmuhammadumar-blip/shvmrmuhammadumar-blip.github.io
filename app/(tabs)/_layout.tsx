import React, { useCallback, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  type ColorValue,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Keyboard,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors } from '../../lib/theme';
import { usePreferences } from '../../lib/preferences';
import { t } from '../../lib/localization';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


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
  return ({ focused, color }: { focused: boolean; color: ColorValue | null }) => (
    <View style={styles.tabIconSlot}>
      <Ionicons name={focused ? active : inactive} size={25} color={typeof color === 'number' ? colors.text : (color ?? colors.text)} />
    </View>
  );
}

function CenterCreateIcon() {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={styles.tabIconSlot}>
      <View style={lumoStyles.createButton}>
        <Ionicons name="add" size={25} color={colors.bg} />
      </View>
    </View>
  );
}

function BrandTitle({ showWord = true }: { showWord?: boolean }) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.brandTitle}>
      <Image
        source={require('../../assets/lumo-mark.png')}
        style={lumoStyles.brandMark}
        contentFit="contain"
      />
      {showWord ? <Text style={lumoStyles.brandText}>Lumo</Text> : null}
    </View>
  );
}

type HeaderProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

function HomeHeaderTitle({ showWord }: { showWord: boolean }) {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user?.id ?? '';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HeaderProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = query.trim().replace(/[%,_]/g, '').slice(0, 80);
    if (!term) {
      setResults([]);
      setLoading(false);
      setError('');
      return;
    }

    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const { data, error: searchError } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .neq('id', me)
          .or('username.ilike.%' + term + '%,full_name.ilike.%' + term + '%')
          .limit(6);
        if (searchError) throw searchError;
        if (active) setResults((data ?? []) as HeaderProfile[]);
      } catch (searchError) {
        if (active) {
          setResults([]);
          setError(searchError instanceof Error ? searchError.message : 'Search failed.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 240);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, me]);

  return (
    <View style={lumoStyles.homeHeaderTitle}>
      <BrandTitle showWord={showWord} />
      <View style={lumoStyles.headerProfileSearch}>
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <TextInput
          style={lumoStyles.headerProfileSearchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search profiles"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search profiles"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => { setQuery(''); Keyboard.dismiss(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear profile search">
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
        {query.trim().length > 0 ? (
          <View style={lumoStyles.headerProfileSearchResults}>
            {loading ? (
              <View style={lumoStyles.headerProfileSearchState}><ActivityIndicator color={colors.accent} /><Text style={lumoStyles.headerProfileSearchHint}>Searching...</Text></View>
            ) : error ? (
              <Text style={lumoStyles.headerProfileSearchHint}>{error}</Text>
            ) : results.length > 0 ? results.map((profile) => (
              <Pressable
                key={profile.id}
                style={lumoStyles.headerProfileSearchResult}
                onPress={() => {
                  Keyboard.dismiss();
                  setQuery('');
                  router.push('/user/' + profile.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={'Open ' + (profile.username || profile.full_name || 'profile')}
              >
                <Avatar uri={profile.avatar_url} name={profile.username || profile.full_name || 'Lumo member'} size={36} />
                <View style={lumoStyles.headerProfileSearchCopy}>
                  <Text style={lumoStyles.headerProfileSearchName} numberOfLines={1}>{profile.username ? '@' + profile.username : profile.full_name || 'Lumo member'}</Text>
                  {profile.username && profile.full_name ? <Text style={lumoStyles.headerProfileSearchHint} numberOfLines={1}>{profile.full_name}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            )) : (
              <Text style={lumoStyles.headerProfileSearchHint}>No profiles found.</Text>
            )}
          </View>
        ) : null}
      </View>
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
  { label: 'Studio', path: '/creator-studio', icon: 'bar-chart-outline', section: 'more' },
  { label: 'Events', path: '/events', icon: 'calendar-outline', section: 'more' },
  { label: 'Mini Apps', path: '/mini-apps', icon: 'apps-outline', section: 'more' },
  { label: 'Live', path: '/live', icon: 'radio-outline', section: 'more' },
  { label: 'Perks', path: '/perks', icon: 'ribbon-outline', section: 'more' },
  { label: 'Create', path: '/create', icon: 'add-circle-outline', section: 'more' },
  { label: 'Profile', path: '/profile', icon: 'person-circle-outline', section: 'more' },
];

export default function TabsLayout() {
  const lumoStyles = useThemedStyles(styles);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isDesktop = windowWidth >= 1280;
  const isTablet = windowWidth >= 900;
  const isCompactPhone = windowWidth < 380;
  const notifSheetMaxHeight = Math.min(
    windowHeight * (isDesktop ? 0.84 : 0.9),
    isDesktop ? 760 : 760,
  );

  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();
  const { palette, locale } = usePreferences();
  const localizedNavigation = appNavigation.map((item) => ({ ...item, translatedLabel: t(locale, item.label) }));
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

  const moduleMenuContent = (
    <View style={lumoStyles.moduleOverlay}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setModulesVisible(false)}
        accessibilityRole="button"
        accessibilityLabel="Close modules"
      />
      <View style={lumoStyles.moduleSheet}>
        <View style={lumoStyles.moduleSheetHeader}>
          <View>
            <Text style={lumoStyles.moduleSheetEyebrow}>LUMO ECOSYSTEM</Text>
            <Text style={lumoStyles.moduleSheetTitle}>Explore modules</Text>
          </View>
          <Pressable
            style={lumoStyles.sheetCloseBtn}
            onPress={() => setModulesVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close modules"
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Pressable
          style={lumoStyles.moduleLiveFeature}
          onPress={() => navigateTo('/live')}
          accessibilityRole="button"
          accessibilityLabel="Open LUMO LIVE"
        >
          <View style={lumoStyles.moduleLiveFeatureIcon}>
            <Ionicons name="radio" size={22} color={resolveThemeColor("#10151A", "color")} />
          </View>
          <View style={lumoStyles.moduleLiveFeatureCopy}>
            <Text style={lumoStyles.moduleLiveFeatureEyebrow}>LIVE BROADCASTS</Text>
            <Text style={lumoStyles.moduleLiveFeatureTitle}>Open LUMO LIVE</Text>
            <Text style={lumoStyles.moduleLiveFeatureSubtitle}>Watch a room or start your own stage</Text>
          </View>
          <Ionicons name="arrow-forward" size={19} color={resolveThemeColor("#D9E7BC", "color")} />
        </Pressable>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={lumoStyles.moduleGrid}
        >
          {appNavigation
            .filter((item) => item.path !== '/' && item.path !== '/live')
            .sort((a, b) => {
              const aQuickAction = a.path === '/create' || a.path === '/profile';
              const bQuickAction = b.path === '/create' || b.path === '/profile';
              return Number(bQuickAction) - Number(aQuickAction);
            })
            .map((item) => (
              <Pressable
                key={item.path}
                onPress={() => navigateTo(item.path)}
                style={lumoStyles.moduleGridItem}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={lumoStyles.moduleGridIcon}>
                  <Ionicons name={item.icon} size={21} color={colors.accentStrong} />
                </View>
                <Text style={lumoStyles.moduleGridLabel}>{item.label}</Text>
              </Pressable>
            ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <>
      <View style={[lumoStyles.appFrame, { backgroundColor: palette.bg }]}>
        {isTablet ? (
          <View style={[lumoStyles.sidebar, !isDesktop && lumoStyles.sidebarCompact, { backgroundColor: palette.surface, borderRightColor: palette.border }]}>
            <Pressable style={lumoStyles.sidebarBrand} onPress={() => navigateTo('/')} accessibilityRole="button" accessibilityLabel="Lumo home">
              <Image source={require('../../assets/lumo-mark.png')} style={lumoStyles.sidebarMark} contentFit="contain" />
              {isDesktop ? <Text style={lumoStyles.sidebarBrandText}>Lumo</Text> : null}
            </Pressable>
            <ScrollView contentContainerStyle={lumoStyles.sidebarScroll} showsVerticalScrollIndicator={false}>
              <Text style={lumoStyles.sidebarSection}>{isDesktop ? t(locale, 'Your space').toUpperCase() : ''}</Text>
              {localizedNavigation.filter((item) => item.section === 'main').map((item) => {
                const selected = activePath === item.path || (item.path === '/' && activePath === '/');
                return (
                  <Pressable key={item.label} onPress={() => navigateTo(item.path)} style={[lumoStyles.sidebarItem, selected && lumoStyles.sidebarItemSelected]} accessibilityRole="button" accessibilityLabel={item.translatedLabel} accessibilityState={{ selected }}>
                    <Ionicons name={item.icon} size={20} color={selected ? palette.accentStrong : palette.muted} />
                    {isDesktop ? <Text style={[lumoStyles.sidebarLabel, selected && lumoStyles.sidebarLabelSelected]}>{item.translatedLabel}</Text> : null}
                  </Pressable>
                );
              })}
              <Text style={lumoStyles.sidebarSection}>{isDesktop ? t(locale, 'More from Lumo').toUpperCase() : ''}</Text>
              {localizedNavigation.filter((item) => item.section === 'more').map((item) => {
                const selected = activePath === item.path;
                return (
                  <Pressable key={item.label} onPress={() => navigateTo(item.path)} style={[lumoStyles.sidebarItem, selected && lumoStyles.sidebarItemSelected]} accessibilityRole="button" accessibilityLabel={item.translatedLabel} accessibilityState={{ selected }}>
                    <Ionicons name={item.icon} size={20} color={selected ? palette.accentStrong : palette.muted} />
                    {isDesktop ? <Text style={[lumoStyles.sidebarLabel, selected && lumoStyles.sidebarLabelSelected]}>{item.translatedLabel}</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <View style={lumoStyles.tabsColumn}>
      <Tabs
        screenOptions={{
          tabBarShowLabel: false,
          tabBarActiveTintColor: palette.accentStrong,
          tabBarInactiveTintColor: palette.muted,
          tabBarStyle: {
            display: isTablet ? 'none' : 'flex',
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
            backgroundColor: palette.bg,
            borderTopColor: palette.border,
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
            paddingHorizontal: 6,
          },
          tabBarItemStyle: {
            width: '20%',
            maxWidth: '20%',
            flexBasis: '20%',
            flexGrow: 0,
            flexShrink: 0,
            minWidth: 0,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 0,
          },
          tabBarIconStyle: {
            width: '100%',
            height: 44,
            marginTop: 1,
          },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.bg },
          headerTitleStyle: {
            fontWeight: '900',
            color: palette.text,
            fontSize: 24,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Lumo',
            headerTitle: () => <HomeHeaderTitle showWord={isTablet} />,
            headerTitleAlign: 'left',
            headerTitleContainerStyle: { flex: 1, minWidth: 0, marginRight: 4 },
            headerRightContainerStyle: { paddingRight: 10, paddingLeft: 4 },
            headerRight: () => (
              <View style={[lumoStyles.headerRight, isCompactPhone && lumoStyles.headerRightCompact]}>
                {!isTablet ? (
                  <Pressable
                    onPress={() => setModulesVisible(true)}
                    style={lumoStyles.headerIconBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Open Lumo modules"
                  >
                    <Ionicons name="apps-outline" size={23} color={colors.text} />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void openNotifications()}
                  style={lumoStyles.headerIconBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Ionicons name="notifications-outline" size={24} color={colors.text} />
                  {unreadNotifications > 0 && (
                    <View style={lumoStyles.notificationBadge}>
                      <Text style={lumoStyles.notificationBadgeText}>
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

        <Tabs.Screen name="perks" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="wallet" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="video" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="spaces" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="market" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="map" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="studio" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="events" options={{ tabBarButton: () => null, headerShown: false }} />
        <Tabs.Screen name="mini-apps" options={{ tabBarButton: () => null, headerShown: false }} />
      </Tabs>
        </View>
      </View>

      {Platform.OS === 'web' ? (
        modulesVisible ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { zIndex: 10000, elevation: 10000 },
            ]}
          >
            {moduleMenuContent}
          </View>
        ) : null
      ) : (
        <Modal
          visible={modulesVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModulesVisible(false)}
        >
          {moduleMenuContent}
        </Modal>
      )}

      <Modal
        visible={notificationsVisible}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={() => setNotificationsVisible(false)}
      >
        <View
          style={[
            lumoStyles.notifOverlay,
            isDesktop && lumoStyles.notifOverlayDesktop,
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
              lumoStyles.notifSheet,
              isDesktop && lumoStyles.notifSheetDesktop,
              { maxHeight: notifSheetMaxHeight },
            ]}
          >
            {!isDesktop && <View style={lumoStyles.sheetHandle} />}

            <View style={lumoStyles.sheetHeader}>
              <Text style={lumoStyles.sheetTitle}>Activity</Text>
              <View style={lumoStyles.sheetHeaderActions}>
                {unreadNotifications > 0 && (
                  <Pressable
                    onPress={() => void markAllNotificationsRead()}
                    disabled={markingAllRead}
                    hitSlop={8}
                    style={lumoStyles.markAllReadButton}
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
                        <Text style={lumoStyles.markAllReadText}>Mark all read</Text>
                      </>
                    )}
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setNotificationsVisible(false)}
                  hitSlop={10}
                  style={lumoStyles.sheetCloseBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Close Activity"
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>

            <View style={lumoStyles.filterTabs} accessibilityLabel="Notification categories">
              {notificationFilters.map((filter) => {
                const selected = activeNotificationFilter === filter.key;

                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => setActiveNotificationFilter(filter.key)}
                    style={lumoStyles.filterTab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[
                        lumoStyles.filterTabText,
                        selected && lumoStyles.filterTabTextActive,
                      ]}
                    >
                      {filter.label}
                    </Text>
                    {selected && <View style={lumoStyles.filterTabIndicator} />}
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              style={lumoStyles.notifScroll}
              contentContainerStyle={lumoStyles.notifList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {notificationsLoading ? (
                <View style={lumoStyles.notifEmpty}>
                  <ActivityIndicator color={colors.lime} size="small" />
                </View>
              ) : visibleNotifications.length === 0 ? (
                <View style={lumoStyles.notifEmpty}>
                  <Text style={lumoStyles.notifEmptyText}>
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
                      <View key={group} style={lumoStyles.notifGroup}>
                        <View style={lumoStyles.notifDateHeader}>
                          <Text style={lumoStyles.notifSectionTitle}>{group}</Text>
                          <View style={lumoStyles.notifDateLine} />
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
                                lumoStyles.notifRow,
                                pressed && lumoStyles.notifRowPressed,
                              ]}
                            >
                              <View style={lumoStyles.notifAvatarWrap}>
                                <Avatar
                                  uri={item.actor?.avatar_url}
                                  name={actorName}
                                  size={40}
                                />

                                {!item.is_read && <View style={lumoStyles.notifUnreadDot} />}

                                {!postImage && (
                                  <View style={lumoStyles.notifTypeBadge}>
                                    <Ionicons
                                      name={iconName}
                                      size={10}
                                      color={item.type === 'like' ? colors.like : colors.muted}
                                    />
                                  </View>
                                )}
                              </View>

                              <View style={lumoStyles.notifMessage}>
                                <Text style={lumoStyles.notifText} numberOfLines={2}>
                                  <Text style={lumoStyles.notifBold}>{actorName}</Text>
                                  <Text
                                    style={[
                                      lumoStyles.notifAction,
                                      !item.is_read && lumoStyles.notifActionUnread,
                                    ]}
                                  >
                                    {getNotificationAction(item)}
                                  </Text>
                                </Text>

                                {item.type === 'mention' && item.comment?.body?.trim() ? (
                                  <Text style={lumoStyles.notifContext} numberOfLines={1}>
                                    {item.comment.body.trim()}
                                  </Text>
                                ) : null}

                                <Text style={lumoStyles.notifTime}>
                                  {getRelativeTime(item.created_at)}
                                </Text>
                              </View>

                              {postImage ? (
                                <Image
                                  source={{ uri: postImage }}
                                  style={lumoStyles.notifThumbnail}
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
                <Text style={lumoStyles.notifError}>{notificationsError}</Text>
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
  moduleOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  moduleSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, maxHeight: '78%' },
  moduleSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  moduleSheetEyebrow: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  moduleSheetTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 4 },
  moduleLiveFeature: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(201,217,164,0.32)', backgroundColor: '#18211F', marginBottom: 15 },
  moduleLiveFeatureIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center' },
  moduleLiveFeatureCopy: { flex: 1, gap: 2 },
  moduleLiveFeatureEyebrow: { color: '#C9D9A4', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  moduleLiveFeatureTitle: { color: '#F2F5F7', fontSize: 13, fontWeight: '900' },
  moduleLiveFeatureSubtitle: { color: '#A3B0A1', fontSize: 9 },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  moduleGridItem: { flexBasis: '30%', flexGrow: 1, flexShrink: 1, minWidth: 0, minHeight: 84, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  moduleGridIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  moduleGridLabel: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tabIconSlot: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  homeHeaderTitle: { flex: 1, minWidth: 0, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerProfileSearch: { flex: 1, minWidth: 0, maxWidth: 440, height: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, position: 'relative', zIndex: 50 },
  headerProfileSearchInput: { flex: 1, minWidth: 0, color: colors.text, paddingVertical: 8, fontSize: 13 },
  headerProfileSearchResults: { position: 'absolute', top: 45, left: 0, right: 0, zIndex: 1000, elevation: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  headerProfileSearchState: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  headerProfileSearchHint: { color: colors.muted, fontSize: 12, paddingHorizontal: 12, paddingVertical: 12 },
  headerProfileSearchResult: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerProfileSearchCopy: { flex: 1, minWidth: 0, gap: 2 },
  headerProfileSearchName: { color: colors.text, fontSize: 13, fontWeight: '700' },
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
    gap: 8,
    marginRight: 0,
  },
  headerRightCompact: {
    gap: 5,
  },
  headerIconBtn: {
    width: 34,
    height: 38,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(242,245,247,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 0,
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
