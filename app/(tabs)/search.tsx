import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors, radii } from '../../lib/theme';
import { getPublicChannels } from '../../lib/channels';
import { POST_SELECT, timeAgo } from '../../lib/api';
import { getAppContentWidth, getSearchGridMetrics } from '../../lib/responsive';
import type { Post, Profile } from '../../lib/types';
import { useThemedStyles } from "../../lib/theme-styles";

type Scope = 'People' | 'Posts' | 'Videos' | 'Groups' | 'Channels' | 'Topics';
type ScopeOption = {
  key: Scope;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};
type SearchItem = {
  id: string;
  kind: 'person' | 'post' | 'video' | 'group' | 'channel';
  title: string;
  subtitle: string;
  description?: string | null;
  imageUrl?: string | null;
  route: string;
  createdAt?: string;
};
type ScopeDetails = {
  heading: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const scopes: ScopeOption[] = [
  { key: 'People', label: 'People', icon: 'people-outline' },
  { key: 'Posts', label: 'Posts', icon: 'grid-outline' },
  { key: 'Videos', label: 'Videos', icon: 'play-circle-outline' },
  { key: 'Groups', label: 'Groups', icon: 'people-circle-outline' },
  { key: 'Channels', label: 'Channels', icon: 'radio-outline' },
  { key: 'Topics', label: 'Topics', icon: 'pricetag-outline' },
];

const scopeDetails: Record<Scope, ScopeDetails> = {
  People: {
    heading: 'People to discover',
    description: 'Find new faces and profiles across LUMO.',
    emptyTitle: 'No people found',
    emptyDescription: 'Try another name or username.',
    icon: 'people-outline',
  },
  Posts: {
    heading: 'Fresh from the community',
    description: 'Photos and moments shared on LUMO.',
    emptyTitle: 'No posts found',
    emptyDescription: 'Try a different keyword or explore another category.',
    icon: 'images-outline',
  },
  Videos: {
    heading: 'Videos',
    description: 'Watch what people are sharing.',
    emptyTitle: 'No videos found',
    emptyDescription: 'Try a different keyword or check back later.',
    icon: 'play-circle-outline',
  },
  Groups: {
    heading: 'Public groups',
    description: 'Find communities you can join.',
    emptyTitle: 'No public groups found',
    emptyDescription: 'Try a broader name or another keyword.',
    icon: 'people-circle-outline',
  },
  Channels: {
    heading: 'Public channels',
    description: 'Discover channels and follow their updates.',
    emptyTitle: 'No public channels found',
    emptyDescription: 'Try a different channel name or username.',
    icon: 'radio-outline',
  },
  Topics: {
    heading: 'Hashtags & topics',
    description: 'Explore posts around a hashtag or topic.',
    emptyTitle: 'No posts for this topic',
    emptyDescription: 'Try another hashtag or a broader topic.',
    icon: 'pricetag-outline',
  },
};

function sanitizeSearchTerm(value: string) {
  return value.trim().replace(/[%,_(),\\]/g, '').slice(0, 80);
}

export default function SearchScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const me = session?.user?.id ?? '';
  const router = useRouter();
  const { width } = useWindowDimensions();
  const appContentWidth = getAppContentWidth(width, true);
  const grid = getSearchGridMetrics(appContentWidth);

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('People');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [focused, setFocused] = useState(false);
  const [browseScope, setBrowseScope] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [exploreItems, setExploreItems] = useState<SearchItem[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<Array<{ label: string; count: number }>>([]);
  const [trendingCreators, setTrendingCreators] = useState<SearchItem[]>([]);
  const [loadingExplore, setLoadingExplore] = useState(true);
  const [exploreError, setExploreError] = useState(false);

  const historyKey = `lumo.search.history.${me || 'guest'}`;

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(historyKey)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.filter((value): value is string => typeof value === 'string').slice(0, 8));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [historyKey]);

  const saveRecentSearch = async (value: string) => {
    const term = value.trim();
    if (!term) return;
    const next = [term, ...recentSearches.filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    setRecentSearches(next);
    try {
      await AsyncStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      // Search remains usable when local storage is unavailable.
    }
  };

  const removeRecentSearch = async (value: string) => {
    const next = recentSearches.filter((item) => item !== value);
    setRecentSearches(next);
    try {
      await AsyncStorage.setItem(historyKey, JSON.stringify(next));
    } catch {
      // Keep the visible state updated even if persistence fails.
    }
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    try {
      await AsyncStorage.removeItem(historyKey);
    } catch {
      // Keep the visible state cleared even if persistence fails.
    }
  };

  useEffect(() => {
    let active = true;
    const loadExplore = async () => {
      setLoadingExplore(true);
      setExploreError(false);
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        const posts = (data ?? []) as unknown as Post[];

        const toItem = (post: Post): SearchItem => {
          const isVideo = post.media_type === 'video' || Boolean(post.video_url);
          return {
            id: post.id,
            kind: isVideo ? 'video' : 'post',
            title: post.profiles?.username ? `@${post.profiles.username}` : 'LUMO member',
            subtitle: post.caption?.trim() || (isVideo ? 'Video post' : 'Photo post'),
            imageUrl: post.image_url,
            createdAt: post.created_at,
            route: `/post/${post.id}`,
          };
        };

        const tagCounts = new Map<string, number>();
        const creatorCounts = new Map<string, { count: number; item: SearchItem }>();

        posts.forEach((post) => {
          const tags = post.caption?.match(/#[\p{L}\p{N}_]{2,30}/gu) ?? [];
          tags.forEach((tag) => {
            const normalized = tag.toLocaleLowerCase();
            tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
          });

          if (post.user_id && post.user_id !== me) {
            const existing = creatorCounts.get(post.user_id);
            const profile = post.profiles;
            const item: SearchItem = {
              id: post.user_id,
              kind: 'person',
              title: profile?.username ? `@${profile.username}` : 'LUMO member',
              subtitle: 'Active creator',
              imageUrl: profile?.avatar_url,
              route: `/user/${post.user_id}`,
            };
            creatorCounts.set(post.user_id, { count: (existing?.count ?? 0) + 1, item });
          }
        });

        if (!active) return;
        setExploreItems(posts.slice(0, 30).map(toItem));
        setTrendingTopics(
          [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 10)
            .map(([label, count]) => ({ label, count })),
        );
        setTrendingCreators(
          [...creatorCounts.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
            .map(({ item }) => item),
        );
      } catch {
        if (active) setExploreError(true);
      } finally {
        if (active) setLoadingExplore(false);
      }
    };

    void loadExplore();
    return () => {
      active = false;
    };
  }, [me, retryKey]);

  useEffect(() => {
    const hasTerm = query.trim().length > 0;
    if (!hasTerm && !browseScope) {
      setResults([]);
      setLoading(false);
      setLoadError(false);
      return;
    }

    let active = true;
    const term = sanitizeSearchTerm(query);
    setLoading(true);
    setLoadError(false);

    const timer = setTimeout(async () => {
      try {
        let items: SearchItem[] = [];

        if (scope === 'People') {
          let request = supabase
            .from('profiles')
            .select('id, username, full_name, bio, avatar_url, created_at')
            .limit(24);

          if (me) request = request.neq('id', me);
          if (term) {
            request = request.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
          } else {
            request = request.order('created_at', { ascending: false });
          }

          const { data, error } = await request;
          if (error) throw error;

          items = ((data ?? []) as unknown as Profile[]).map((profile) => ({
            id: profile.id,
            kind: 'person',
            title: profile.full_name?.trim() || profile.username || 'LUMO member',
            subtitle: profile.username ? `@${profile.username}` : 'LUMO member',
            description: profile.bio?.trim() || null,
            imageUrl: profile.avatar_url,
            createdAt: profile.created_at,
            route: `/user/${profile.id}`,
          }));
        } else if (scope === 'Posts' || scope === 'Videos' || scope === 'Topics') {
          let request = supabase
            .from('posts')
            .select(POST_SELECT)
            .order('created_at', { ascending: false })
            .limit(24);

          if (scope === 'Videos') {
            request = request.or('media_type.eq.video,video_url.not.is.null');
          }
          if (scope === 'Topics') {
            const hashtag = term.startsWith('#') ? term : `#${term}`;
            request = request.ilike('caption', `%${hashtag}%`);
          } else if (term) {
            request = request.ilike('caption', `%${term}%`);
          }

          const { data, error } = await request;
          if (error) throw error;

          items = ((data ?? []) as unknown as Post[]).map((post) => {
            const isVideo = post.media_type === 'video' || Boolean(post.video_url);
            return {
              id: post.id,
              kind: isVideo ? 'video' : 'post',
              title: post.profiles?.username ? `@${post.profiles.username}` : 'LUMO member',
              subtitle: post.caption?.trim() || (isVideo ? 'Video post' : 'Photo post'),
              imageUrl: post.image_url,
              createdAt: post.created_at,
              route: `/post/${post.id}`,
            };
          });
        } else if (scope === 'Channels') {
          const channels = await getPublicChannels(term, 24);
          items = channels.map((channel) => ({
            id: channel.id,
            kind: 'channel',
            title: channel.name,
            subtitle: channel.username ? `@${channel.username}` : 'Public channel',
            description: channel.description || null,
            imageUrl: channel.avatar_url,
            route: `/channels/${channel.id}`,
          }));
        } else {
          let request = supabase
            .from('chat_groups')
            .select('id, name, description, avatar_url')
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(24);

          if (term) request = request.or(`name.ilike.%${term}%,description.ilike.%${term}%`);

          const { data, error } = await request;
          if (error) throw error;

          items = (data ?? []).map((group) => ({
            id: group.id,
            kind: 'group',
            title: group.name,
            subtitle: 'Public group',
            description: group.description || null,
            imageUrl: group.avatar_url,
            route: `/groups/${group.id}`,
          }));
        }

        if (active) setResults(items);
      } catch {
        if (!active) return;
        setResults([]);
        setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, hasTerm ? 280 : 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, scope, me, retryKey, browseScope]);

  const details = scopeDetails[scope];
  const hasQuery = query.trim().length > 0;
  const countLabel = results.length === 24 ? '24 shown' : `${results.length} ${results.length === 1 ? 'result' : 'results'}`;
  const isDirectory = scope === 'Groups' || scope === 'Channels';
  const isLanding = !hasQuery && !focused && !browseScope;
  const isFocusPanel = !hasQuery && focused;

  const openResult = (item: SearchItem) => {
    if (query.trim()) void saveRecentSearch(query);
    setFocused(false);
    Keyboard.dismiss();
    router.push(item.route as never);
  };

  const applySearch = (value: string, nextScope?: Scope) => {
    const term = value.trim();
    if (!term) return;
    setQuery(term);
    setScope(nextScope ?? (term.startsWith('#') ? 'Topics' : 'Posts'));
    setBrowseScope(false);
    setFocused(false);
    void saveRecentSearch(term);
    Keyboard.dismiss();
  };

  const submitSearch = () => {
    const term = query.trim();
    if (!term) return;
    if (term.startsWith('#')) setScope('Topics');
    setBrowseScope(false);
    setFocused(false);
    void saveRecentSearch(term);
    Keyboard.dismiss();
  };

  const relatedSearches = (() => {
    const normalized = query.trim().replace(/^#/, '').toLowerCase();
    const relatedMap: Record<string, string[]> = {
      design: ['#uidesign', '#uxdesign', '#figma'],
      'web design': ['#uidesign', '#uxdesign', '#frontend'],
      technology: ['#ai', '#programming', '#innovation'],
      ai: ['#technology', '#machinelearning', '#creativeai'],
      photography: ['#cinematography', '#visualart', '#portrait'],
      music: ['#beats', '#newmusic', '#producer'],
      coding: ['#programming', '#javascript', '#webdevelopment'],
      fitness: ['#workout', '#healthylifestyle', '#training'],
    };
    const mapped = relatedMap[normalized] ?? [];
    const discovered = trendingTopics
      .map((topic) => topic.label)
      .filter((tag) => tag.replace(/^#/, '') !== normalized);
    return [...new Set([...mapped, ...discovered])].slice(0, 6);
  })();

  const clearQuery = () => {
    setQuery('');
    setBrowseScope(false);
    setFocused(false);
    Keyboard.dismiss();
  };

  const renderLoading = () => (
    <View style={lumoStyles.loadingGrid}>
      {Array.from({ length: isDirectory ? 5 : 6 }).map((_, index) => (
        isDirectory ? (
          <View key={index} style={lumoStyles.directorySkeleton}>
            <View style={lumoStyles.skeletonAvatar} />
            <View style={lumoStyles.skeletonCopy}>
              <View style={[lumoStyles.skeletonLine, { width: '52%' }]} />
              <View style={[lumoStyles.skeletonLine, { width: '78%' }]} />
            </View>
            <View style={lumoStyles.skeletonDot} />
          </View>
        ) : scope === 'People' ? (
          <View key={index} style={[lumoStyles.personSkeleton, { width: grid.cardWidth }]}>
            <View style={lumoStyles.skeletonAvatarLarge} />
            <View style={[lumoStyles.skeletonLine, { width: '70%' }]} />
            <View style={[lumoStyles.skeletonLine, { width: '48%' }]} />
            <View style={[lumoStyles.skeletonLine, { width: '88%' }]} />
          </View>
        ) : (
          <View key={index} style={[lumoStyles.postSkeleton, { width: grid.cardWidth }]}>
            <View style={lumoStyles.skeletonMedia} />
            <View style={lumoStyles.skeletonPostCopy}>
              <View style={[lumoStyles.skeletonLine, { width: '54%' }]} />
              <View style={[lumoStyles.skeletonLine, { width: '84%' }]} />
            </View>
          </View>
        )
      ))}
    </View>
  );

  const renderPeople = (items: SearchItem[] = results) => {
    const removable = items === results && scope === 'People' && query.trim().length > 0;

    return (
      <View style={lumoStyles.grid}>
        {items.map((item) => (
          <View key={item.id} style={[lumoStyles.personCard, { width: grid.cardWidth }]}>
            <View style={lumoStyles.personCardTop}>
              <Avatar uri={item.imageUrl} name={item.title} size={54} />
              {removable ? (
                <Pressable
                  onPress={() => setResults((current) => current.filter((result) => result.id !== item.id))}
                  hitSlop={9}
                  style={lumoStyles.removePersonButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.title} from search results`}
                >
                  <Ionicons name="close" size={16} color={colors.muted} />
                </Pressable>
              ) : (
                <View style={lumoStyles.personArrow}>
                  <Ionicons name="arrow-forward" size={15} color={colors.muted} />
                </View>
              )}
            </View>
            <Pressable
              style={lumoStyles.personCardMain}
              onPress={() => openResult(item)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}'s profile`}
            >
              <Text style={lumoStyles.personName} numberOfLines={1}>{item.title}</Text>
              <Text style={lumoStyles.personHandle} numberOfLines={1}>{item.subtitle}</Text>
              {item.description ? (
                <Text style={lumoStyles.personBio} numberOfLines={2}>{item.description}</Text>
              ) : (
                <Text style={lumoStyles.personBioMuted}>LUMO member</Text>
              )}
            </Pressable>
          </View>
        ))}
      </View>
    );
  };

  const renderMedia = (items: SearchItem[] = results) => (
    <View style={lumoStyles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => openResult(item)}
          style={({ pressed }) => [
            lumoStyles.mediaCard,
            { width: grid.cardWidth },
            pressed && lumoStyles.cardPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.kind === 'video' ? 'video' : 'post'} by ${item.title}`}
        >
          <View style={lumoStyles.mediaStage}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={lumoStyles.mediaImage}
                contentFit="cover"
                transition={160}
              />
            ) : (
              <View style={lumoStyles.mediaFallback}>
                <Ionicons
                  name={item.kind === 'video' ? 'videocam-outline' : 'image-outline'}
                  size={25}
                  color={colors.muted}
                />
              </View>
            )}
            {item.kind === 'video' ? (
              <View style={lumoStyles.playBadge}>
                <Ionicons name="play" size={14} color={colors.bg} />
              </View>
            ) : null}
            {item.createdAt ? (
              <View style={lumoStyles.timeBadge}>
                <Text style={lumoStyles.timeBadgeText}>{timeAgo(item.createdAt)}</Text>
              </View>
            ) : null}
          </View>
          <View style={lumoStyles.mediaCopy}>
            <Text style={lumoStyles.mediaAuthor} numberOfLines={1}>{item.title}</Text>
            <Text style={lumoStyles.mediaCaption} numberOfLines={2}>{item.subtitle}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );

  const renderDirectory = () => (
    <View style={lumoStyles.directoryList}>
      {results.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => openResult(item)}
          style={({ pressed }) => [
            lumoStyles.directoryRow,
            pressed && lumoStyles.directoryRowPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.kind} ${item.title}`}
        >
          <Avatar uri={item.imageUrl} name={item.title} size={50} />
          <View style={lumoStyles.directoryCopy}>
            <Text style={lumoStyles.directoryTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={lumoStyles.directorySubtitle} numberOfLines={1}>{item.subtitle}</Text>
            {item.description ? (
              <Text style={lumoStyles.directoryDescription} numberOfLines={2}>{item.description}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.dim} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={lumoStyles.root}>
      <ScrollView
        style={lumoStyles.scroll}
        contentContainerStyle={lumoStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={lumoStyles.content}>
          <View style={[lumoStyles.searchBox, focused && lumoStyles.searchBoxFocused]}>
            <View style={lumoStyles.searchIcon}>
              <Ionicons name="search-outline" size={19} color={focused ? colors.accentStrong : colors.muted} />
            </View>
            <TextInput
              style={lumoStyles.input}
              placeholder="Search anything on LUMO"
              placeholderTextColor={colors.dim}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="search"
              selectionColor={colors.accentStrong}
              accessibilityLabel={`Search ${scope.toLowerCase()}`}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setBrowseScope(false);
                if (value.trim().startsWith('#')) setScope('Topics');
                else if (scope === 'Topics') setScope('Posts');
              }}
              onFocus={() => {
                setFocused(true);
                setBrowseScope(false);
              }}
              onBlur={() => setFocused(false)}
              onSubmitEditing={submitSearch}
            />
            {query.length > 0 ? (
              <Pressable
                onPress={clearQuery}
                hitSlop={10}
                style={lumoStyles.clearButton}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={19} color={colors.muted} />
              </Pressable>
            ) : (
              <View style={lumoStyles.searchHint}>
                <Ionicons name="enter-outline" size={15} color={colors.dim} />
              </View>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={lumoStyles.scopeRail}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="Search categories"
          >
            {scopes.map((item) => {
              const selected = scope === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    lumoStyles.scopeButton,
                    selected && lumoStyles.scopeButtonSelected,
                    pressed && !selected && lumoStyles.scopeButtonPressed,
                  ]}
                  onPress={() => {
                    setScope(item.key);
                    setFocused(false);
                    if (!hasQuery) setBrowseScope(true);
                    Keyboard.dismiss();
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={item.icon}
                    size={16}
                    color={selected ? colors.bg : colors.muted}
                  />
                  <Text style={[lumoStyles.scopeText, selected && lumoStyles.scopeTextSelected]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {isFocusPanel ? (
            <View style={lumoStyles.discoverySection}>
              {recentSearches.length > 0 ? (
                <View style={lumoStyles.discoveryBlock}>
                  <View style={lumoStyles.discoveryHeader}>
                    <View style={lumoStyles.discoveryHeadingCopy}>
                      <Text style={lumoStyles.resultsTitle}>Recent searches</Text>
                      <Text style={lumoStyles.resultsSubtitle}>Your searches on this device</Text>
                    </View>
                    <Pressable onPress={clearRecentSearches} hitSlop={8} accessibilityRole="button">
                      <Text style={lumoStyles.clearHistoryText}>Clear all</Text>
                    </Pressable>
                  </View>
                  <View style={lumoStyles.historyList}>
                    {recentSearches.map((term) => (
                      <View key={term} style={lumoStyles.historyRow}>
                        <Pressable
                          style={lumoStyles.historyMain}
                          onPress={() => applySearch(term, term.startsWith('#') ? 'Topics' : 'People')}
                          accessibilityRole="button"
                        >
                          <Ionicons name="time-outline" size={16} color={colors.muted} />
                          <Text style={lumoStyles.historyTerm} numberOfLines={1}>{term}</Text>
                          <Ionicons name="return-up-back" size={15} color={colors.dim} />
                        </Pressable>
                        <Pressable
                          onPress={() => void removeRecentSearch(term)}
                          hitSlop={9}
                          style={lumoStyles.historyRemove}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${term} from search history`}
                        >
                          <Ionicons name="close" size={15} color={colors.dim} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={lumoStyles.discoveryBlock}>
                <View style={lumoStyles.discoveryHeader}>
                  <View style={lumoStyles.discoveryHeadingCopy}>
                    <Text style={lumoStyles.resultsTitle}>Creators to discover</Text>
                    <Text style={lumoStyles.resultsSubtitle}>People actively sharing on LUMO</Text>
                  </View>
                </View>
                {loadingExplore ? (
                  <ActivityIndicator color={colors.accentStrong} />
                ) : trendingCreators.length > 0 ? renderPeople(trendingCreators) : (
                  <Text style={lumoStyles.discoveryEmpty}>Active creators will appear here as people share posts on LUMO.</Text>
                )}
              </View>
            </View>
          ) : null}

          {isLanding ? (
            <View style={lumoStyles.discoverySection}>
              <View style={lumoStyles.discoveryBlock}>
                <View style={lumoStyles.discoveryHeader}>
                  <View style={lumoStyles.discoveryHeadingCopy}>
                    <Text style={lumoStyles.resultsTitle}>Explore feed</Text>
                    <Text style={lumoStyles.resultsSubtitle}>A fresh look at what people are sharing</Text>
                  </View>
                </View>
                {loadingExplore ? (
                  <View style={lumoStyles.exploreLoading}>
                    <ActivityIndicator color={colors.accentStrong} />
                    <Text style={lumoStyles.discoveryEmpty}>Loading the latest posts…</Text>
                  </View>
                ) : exploreError ? (
                  <View style={lumoStyles.exploreLoading}>
                    <Text style={lumoStyles.discoveryEmpty}>Explore couldn't load right now.</Text>
                    <Pressable onPress={() => setRetryKey((value) => value + 1)} style={lumoStyles.inlineRetry}>
                      <Ionicons name="refresh-outline" size={14} color={colors.bg} />
                      <Text style={lumoStyles.inlineRetryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : exploreItems.length > 0 ? renderMedia(exploreItems) : (
                  <Text style={lumoStyles.discoveryEmpty}>New posts will appear here as the LUMO community grows.</Text>
                )}
              </View>
            </View>
          ) : null}

          {!isFocusPanel && !isLanding ? (
          <View style={lumoStyles.resultsSection}>
            <View style={lumoStyles.resultsHeader}>
              <View style={lumoStyles.resultsCopy}>
                <Text style={lumoStyles.resultsTitle}>
                  {hasQuery ? 'Search results' : details.heading}
                </Text>
                <Text style={lumoStyles.resultsSubtitle}>
                  {hasQuery ? `In ${scope.toLowerCase()} for “${query.trim()}”` : details.description}
                </Text>
              </View>
              {!loading && !loadError ? (
                <View style={lumoStyles.countPill}>
                  <Text style={lumoStyles.countText}>{countLabel}</Text>
                </View>
              ) : null}
            </View>

            {hasQuery && relatedSearches.length > 0 ? (
              <View style={lumoStyles.relatedBlock}>
                <Text style={lumoStyles.relatedTitle}>Related searches</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lumoStyles.relatedRail}>
                  {relatedSearches.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => applySearch(term, 'Topics')}
                      style={lumoStyles.relatedChip}
                      accessibilityRole="button"
                    >
                      <Ionicons name="search-outline" size={13} color={colors.muted} />
                      <Text style={lumoStyles.relatedText}>{term}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {loading ? renderLoading() : loadError ? (
              <View style={lumoStyles.stateBlock}>
                <View style={lumoStyles.stateIcon}>
                  <Ionicons name="cloud-offline-outline" size={23} color={colors.muted} />
                </View>
                <Text style={lumoStyles.stateTitle}>Search couldn't load</Text>
                <Text style={lumoStyles.stateDescription}>Check your connection and try again.</Text>
                <Pressable
                  onPress={() => setRetryKey((value) => value + 1)}
                  style={lumoStyles.stateAction}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh-outline" size={15} color={colors.bg} />
                  <Text style={lumoStyles.stateActionText}>Try again</Text>
                </Pressable>
              </View>
            ) : results.length === 0 ? (
              <View style={lumoStyles.stateBlock}>
                <View style={lumoStyles.stateIcon}>
                  <Ionicons name={details.icon} size={23} color={colors.muted} />
                </View>
                <Text style={lumoStyles.stateTitle}>
                  {hasQuery ? details.emptyTitle : 'Nothing here yet'}
                </Text>
                <Text style={lumoStyles.stateDescription}>
                  {hasQuery ? details.emptyDescription : 'New activity will appear here as the LUMO community grows.'}
                </Text>
                {hasQuery ? (
                  <Pressable onPress={clearQuery} style={lumoStyles.stateAction} accessibilityRole="button">
                    <Ionicons name="close" size={15} color={colors.bg} />
                    <Text style={lumoStyles.stateActionText}>Clear search</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : scope === 'People' ? renderPeople() : isDirectory ? renderDirectory() : renderMedia()}

            {!hasQuery && !loading && !loadError && results.length > 0 ? (
              <Text style={lumoStyles.footerNote}>
                {scope === 'Groups' || scope === 'Channels'
                  ? 'Only public communities are shown.'
                  : scope === 'People'
                    ? 'Recently joined profiles are shown first.'
                    : scope === 'Topics'
                      ? 'Showing posts that use this hashtag.'
                      : 'Showing the latest content shared on LUMO.'}
              </Text>
            ) : null}
          </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
    width: '100%',
    minWidth: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 36,
  },
  content: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 26,
    gap: 21,
  },
  header: {
    gap: 7,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.1,
    lineHeight: 40,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  searchBox: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchBoxFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  searchIcon: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 13,
    outlineStyle: 'none' as never,
  },
  clearButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchHint: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 22,
  },
  scopeButton: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  scopeButtonSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scopeButtonPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  scopeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  scopeTextSelected: {
    color: colors.bg,
    fontWeight: '800',
  },
  resultsSection: {
    gap: 15,
  },
  resultsHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultsCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  resultsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  resultsSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  countPill: {
    minHeight: 27,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  countText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  personCard: {
    minHeight: 184,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  personCardTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  personCardMain: {
    flex: 1,
    gap: 6,
  },
  personArrow: {
    width: 29,
    height: 29,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  removePersonButton: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  personName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  personHandle: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  personBio: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  personBioMuted: {
    color: colors.dim,
    fontSize: 10,
    marginTop: 3,
  },
  mediaCard: {
    overflow: 'hidden',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  mediaStage: {
    width: '100%',
    aspectRatio: 0.86,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  playBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    minHeight: 23,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242,245,247,0.16)',
    backgroundColor: 'rgba(9,12,18,0.78)',
  },
  timeBadgeText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '700',
  },
  mediaCopy: {
    minHeight: 72,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  mediaAuthor: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  mediaCaption: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  directoryList: {
    overflow: 'hidden',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  directoryRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  directoryRowPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  directoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  directoryTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  directorySubtitle: {
    color: colors.accentStrong,
    fontSize: 10,
    fontWeight: '700',
  },
  directoryDescription: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  loadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  directorySkeleton: {
    width: '100%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skeletonAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceRaised,
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonLine: {
    height: 8,
    borderRadius: 5,
    backgroundColor: colors.surfaceSoft,
  },
  skeletonDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  personSkeleton: {
    minHeight: 168,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
    gap: 10,
  },
  skeletonAvatarLarge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 6,
  },
  postSkeleton: {
    overflow: 'hidden',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skeletonMedia: {
    width: '100%',
    aspectRatio: 0.86,
    backgroundColor: colors.surfaceRaised,
  },
  skeletonPostCopy: {
    minHeight: 72,
    justifyContent: 'center',
    padding: 12,
    gap: 8,
  },
  stateBlock: {
    minHeight: 245,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 9,
  },
  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 3,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  stateDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 300,
  },
  stateAction: {
    minHeight: 37,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    marginTop: 5,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  stateActionText: {
    color: colors.bg,
    fontSize: 11,
    fontWeight: '800',
  },
  footerNote: {
    color: colors.dim,
    fontSize: 10,
    lineHeight: 15,
    paddingTop: 4,
    paddingBottom: 8,
  },
  discoverySection: {
    gap: 24,
  },
  discoveryBlock: {
    gap: 13,
  },
  discoveryHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  discoveryHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  clearHistoryText: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  historyList: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.surface,
  },
  historyRow: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
  },
  historyTerm: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  historyRemove: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  trendChip: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  trendChipPressed: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
  },
  trendRank: {
    color: colors.dim,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  trendLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  trendCount: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  discoveryEmpty: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  exploreLoading: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  inlineRetry: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  inlineRetryText: {
    color: colors.bg,
    fontSize: 10,
    fontWeight: '800',
  },
  relatedBlock: {
    gap: 9,
  },
  relatedTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  relatedRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 12,
  },
  relatedChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  relatedText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  cardPressed: {
    opacity: 0.78,
  },
});
