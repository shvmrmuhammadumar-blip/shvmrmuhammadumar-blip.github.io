import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { useSegments } from 'expo-router';
import { getAppContentWidth, getEventsLayoutMode } from '../../lib/responsive';
import { pickImage, uploadImage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import type { Database } from '../../lib/database.types';
import { useThemedStyles, resolveThemeColor } from "../../lib/theme-styles";


type EventRow = Database['public']['Tables']['events']['Row'];
type RsvpRow = Database['public']['Tables']['event_rsvps']['Row'];
type EventCategory = EventRow['category'];

type ProfileRecord = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

type EventWithHost = EventRow & {
  host: ProfileRecord | null;
  goingCount: number;
  interestedCount: number;
  myStatus: 'going' | 'interested' | null;
};

type CategoryOption = {
  key: EventCategory;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const eventColors = {
  get accent() { return colors.accent; },
  get accentSoft() { return colors.limeGlow; },
  get line() { return colors.glassBorder; },
};

const categoryOptions: CategoryOption[] = [
  { key: 'meetup', label: 'Meetup', icon: 'people-outline' },
  { key: 'birthday', label: 'Birthday', icon: 'gift-outline' },
  { key: 'sports', label: 'Sports', icon: 'football-outline' },
  { key: 'gaming', label: 'Gaming', icon: 'game-controller-outline' },
  { key: 'study', label: 'Study', icon: 'book-outline' },
  { key: 'live', label: 'Live', icon: 'radio-outline' },
  { key: 'launch', label: 'Launch', icon: 'rocket-outline' },
  { key: 'other', label: 'Other', icon: 'sparkles-outline' },
];

const categoryNames: Record<string, string> = Object.fromEntries(
  categoryOptions.map((item) => [item.key, item.label]),
);

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getDefaultStart() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date;
}

function eventDate(date: string) {
  const value = new Date(date);
  return value.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function eventTime(date: string) {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dayNumber(date: string) {
  return new Date(date).toLocaleDateString(undefined, { day: '2-digit' });
}

function monthShort(date: string) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
}

function displayName(profile: ProfileRecord | null | undefined) {
  if (!profile) return 'LUMO member';
  return profile.full_name?.trim() || profile.username || 'LUMO member';
}

function parseStart(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(parsed.getTime())) return null;
  if (localDateValue(parsed) !== date || localTimeValue(parsed) !== time) return null;
  return parsed;
}

function getOwnedImagePath(publicUrl: string | null | undefined, userId: string) {
  if (!publicUrl) return null;
  const marker = '/storage/v1/object/public/images/';
  const markerIndex = publicUrl.indexOf(marker);
  if (markerIndex < 0) return null;
  const encodedPath = publicUrl.slice(markerIndex + marker.length).split('?')[0];
  let path = encodedPath;
  try { path = decodeURIComponent(encodedPath); } catch { return null; }
  return path.startsWith(`${userId}/`) ? path : null;
}

export default function EventsScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const contentWidth = getAppContentWidth(width, segments[0] === '(tabs)');
  const { desktop, tablet, compact } = getEventsLayoutMode(width, contentWidth);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<EventWithHost[]>([]);
  const [myEvents, setMyEvents] = useState<EventWithHost[]>([]);
  const [followings, setFollowings] = useState<ProfileRecord[]>([]);
  const [personalIds, setPersonalIds] = useState<string[]>([]);
  const [blockRows, setBlockRows] = useState<BlockRow[]>([]);
  const [blockProfiles, setBlockProfiles] = useState<ProfileRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'personal'>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [rsvpBusy, setRsvpBusy] = useState<string | null>(null);

  const [createVisible, setCreateVisible] = useState(false);
  const [actionsMenuVisible, setActionsMenuVisible] = useState(false);
  const [personalVisible, setPersonalVisible] = useState(false);
  const [blocksVisible, setBlocksVisible] = useState(false);
  const [searchPeopleVisible, setSearchPeopleVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventWithHost | null>(null);
  const [menuEventId, setMenuEventId] = useState<string | null>(null);
  const [profileSearch, setProfileSearch] = useState('');
  const [profileResults, setProfileResults] = useState<ProfileRecord[]>([]);
  const [searchingProfiles, setSearchingProfiles] = useState(false);

  const [editingEvent, setEditingEvent] = useState<EventWithHost | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<EventCategory>('meetup');
  const [formDescription, setFormDescription] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formCoverUrl, setFormCoverUrl] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [formDate, setFormDate] = useState(() => localDateValue(getDefaultStart()));
  const [formTime, setFormTime] = useState(() => localTimeValue(getDefaultStart()));

  const loadEvents = useCallback(async () => {
    if (!userId) {
      setEvents([]);
      setMyEvents([]);
      setFollowings([]);
      setPersonalIds([]);
      setBlockRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [followingResult, personalResult, blockResult, ownEventsResult] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('event_personal_selections').select('followed_user_id').eq('user_id', userId),
        supabase.from('event_blocks').select('blocker_id,blocked_id'),
        supabase
          .from('events')
          .select('*')
          .eq('host_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('starts_at', { ascending: true })
          .limit(30),
      ]);

      if (followingResult.error) throw followingResult.error;
      if (personalResult.error) throw personalResult.error;
      if (blockResult.error) throw blockResult.error;
      if (ownEventsResult.error) throw ownEventsResult.error;

      const followingIds = (followingResult.data ?? []).map((item) => item.following_id);
      const nextPersonalIds = (personalResult.data ?? []).map((item) => item.followed_user_id);
      const nextBlocks = (blockResult.data ?? []) as BlockRow[];
      const ownRows = (ownEventsResult.data ?? []) as EventRow[];

      const followedProfilesResult = followingIds.length
        ? await supabase
            .from('profiles')
            .select('id,username,full_name,avatar_url')
            .in('id', followingIds)
            .order('username', { ascending: true })
        : { data: [], error: null };

      if (followedProfilesResult.error) throw followedProfilesResult.error;

      const followedProfiles = (followedProfilesResult.data ?? []) as ProfileRecord[];
      const followedSet = new Set(followingIds);
      const validPersonalIds = nextPersonalIds.filter((id) => followedSet.has(id));

      const followedEventsResult = followingIds.length
        ? await supabase
            .from('events')
            .select('*')
            .in('host_id', followingIds)
            .gt('expires_at', new Date().toISOString())
            .order('starts_at', { ascending: true })
            .limit(500)
        : { data: [], error: null };

      if (followedEventsResult.error) throw followedEventsResult.error;

      const followedRows = (followedEventsResult.data ?? []) as EventRow[];
      const allEventRows = [...followedRows, ...ownRows];
      const uniqueEventIds = [...new Set(allEventRows.map((item) => item.id))];
      const uniqueUserIds = [
        ...new Set([
          ...followingIds,
          ...nextBlocks.flatMap((item) => [item.blocker_id, item.blocked_id]),
          ...allEventRows.map((item) => item.host_id),
        ]),
      ];

      const [profilesResult, rsvpResult] = await Promise.all([
        uniqueUserIds.length
          ? supabase
              .from('profiles')
              .select('id,username,full_name,avatar_url')
              .in('id', uniqueUserIds)
          : Promise.resolve({ data: [], error: null }),
        uniqueEventIds.length
          ? supabase
              .from('event_rsvps')
              .select('event_id,user_id,status')
              .in('event_id', uniqueEventIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rsvpResult.error) throw rsvpResult.error;

      const profiles = (profilesResult.data ?? []) as ProfileRecord[];
      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      const rsvpRows = (rsvpResult.data ?? []) as Pick<RsvpRow, 'event_id' | 'user_id' | 'status'>[];

      const attachData = (rows: EventRow[]) =>
        rows.map((item) => {
          const itemRsvps = rsvpRows.filter((rsvp) => rsvp.event_id === item.id);
          const mine = itemRsvps.find((rsvp) => rsvp.user_id === userId);
          return {
            ...item,
            host: profileMap.get(item.host_id) ?? null,
            goingCount: itemRsvps.filter((rsvp) => rsvp.status === 'going').length,
            interestedCount: itemRsvps.filter((rsvp) => rsvp.status === 'interested').length,
            myStatus: (mine?.status === 'going' || mine?.status === 'interested' ? mine.status : null) as
              | 'going'
              | 'interested'
              | null,
          };
        });

      setFollowings(followedProfiles);
      setPersonalIds(validPersonalIds);
      setBlockRows(nextBlocks);
      setEvents(attachData(followedRows));
      setMyEvents(attachData(ownRows));
      setBlockProfiles(profiles.filter((item) => nextBlocks.some((row) =>
        row.blocker_id === item.id || row.blocked_id === item.id,
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load Events.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const activeEvents = useMemo(() => {
    const source = activeTab === 'all'
      ? events
      : events.filter((item) => personalIds.includes(item.host_id));

    const query = searchText.trim().toLowerCase();
    return source.filter((item) => {
      const categoryMatch = activeCategory === 'all' || item.category === activeCategory;
      const hostName = displayName(item.host).toLowerCase();
      const searchMatch = !query || [
        item.title,
        item.description,
        item.location ?? '',
        hostName,
        item.host?.username ?? '',
      ].some((value) => value.toLowerCase().includes(query));
      return categoryMatch && searchMatch && new Date(item.expires_at).getTime() > currentTime;
    });
  }, [activeTab, activeCategory, events, personalIds, searchText, currentTime]);

  const visibleMyEvents = useMemo(
    () => myEvents.filter((item) => new Date(item.expires_at).getTime() > currentTime),
    [myEvents, currentTime],
  );

  const blockedIds = useMemo(
    () => [...new Set(blockRows.flatMap((row) =>
      row.blocker_id === userId ? [row.blocked_id] : row.blocked_id === userId ? [row.blocker_id] : [],
    ))],
    [blockRows, userId],
  );

  const openCreate = (event?: EventWithHost) => {
    setEditingEvent(event ?? null);
    setFormTitle(event?.title ?? '');
    setFormCategory((event?.category as EventCategory) ?? 'meetup');
    setFormDescription(event?.description ?? '');
    setFormLocation(event?.location ?? '');
    setFormMeetingUrl(event?.meeting_url ?? '');
    setFormCoverUrl(event?.cover_url ?? '');
    setCoverUri(null);
    const start = event ? new Date(event.starts_at) : getDefaultStart();
    setFormDate(localDateValue(start));
    setFormTime(localTimeValue(start));
    setCreateVisible(true);
  };

  const chooseCover = async () => {
    try {
      const uri = await pickImage([16, 9]);
      if (uri) {
        setCoverUri(uri);
        setFormCoverUrl('');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open the photo library.');
    }
  };

  const saveEvent = async () => {
    if (!userId || saving) return;
    const title = formTitle.trim();
    if (title.length < 3) {
      setErrorMessage('Event nomi kamida 3 ta belgidan iborat bo‘lishi kerak.');
      return;
    }

    const start = parseStart(formDate.trim(), formTime.trim());
    if (!start) {
      setErrorMessage('Sana YYYY-MM-DD, vaqt esa 24 soat formatida HH:MM bo‘lishi kerak.');
      return;
    }
    if (start.getTime() <= Date.now()) {
      setErrorMessage('Event boshlanish vaqti kelajakda bo‘lishi kerak.');
      return;
    }
    if (formMeetingUrl.trim()) {
      try {
        const url = new URL(formMeetingUrl.trim());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
      } catch {
        setErrorMessage('Meeting link http:// yoki https:// bilan boshlanishi kerak.');
        return;
      }
    }
    if (formCoverUrl.trim()) {
      try {
        const url = new URL(formCoverUrl.trim());
        if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
      } catch {
        setErrorMessage('Cover URL yaroqli https:// yoki http:// manzil bo‘lishi kerak.');
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);
    let uploadedCoverPath: string | null = null;
    try {
      let coverUrl = formCoverUrl.trim() || null;
      if (coverUri) {
        coverUrl = await uploadImage(coverUri, userId, 'event-cover');
        uploadedCoverPath = getOwnedImagePath(coverUrl, userId);
      }

      const payload = {
        title,
        category: formCategory,
        description: formDescription.trim(),
        location: formLocation.trim() || null,
        meeting_url: formMeetingUrl.trim() || null,
        cover_url: coverUrl,
        starts_at: start.toISOString(),
      };

      const result = editingEvent
        ? await supabase.from('events').update(payload).eq('id', editingEvent.id).eq('host_id', userId)
        : await supabase.from('events').insert({ ...payload, host_id: userId });

      if (result.error) throw result.error;
      if (editingEvent) {
        const previousPath = getOwnedImagePath(editingEvent.cover_url, userId);
        if (previousPath && previousPath !== uploadedCoverPath && previousPath !== getOwnedImagePath(coverUrl, userId)) {
          await supabase.storage.from('images').remove([previousPath]);
        }
      }
      setCoverUri(null);
      setCreateVisible(false);
      setEditingEvent(null);
      await loadEvents();
    } catch (error) {
      if (uploadedCoverPath) {
        await supabase.storage.from('images').remove([uploadedCoverPath]);
      }
      setErrorMessage(error instanceof Error ? error.message : 'Event could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!userId || !deleteTarget || saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const coverPath = getOwnedImagePath(deleteTarget.cover_url, userId);
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', deleteTarget.id)
        .eq('host_id', userId);
      if (error) throw error;
      if (coverPath) {
        await supabase.storage.from('images').remove([coverPath]);
      }
      setDeleteTarget(null);
      setMenuEventId(null);
      await loadEvents();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Event could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const updateRsvp = async (event: EventWithHost, status: 'going' | 'interested') => {
    if (!userId || rsvpBusy) return;
    setRsvpBusy(event.id);
    setErrorMessage(null);
    try {
      if (event.myStatus === status) {
        const { error } = await supabase
          .from('event_rsvps')
          .delete()
          .eq('event_id', event.id)
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('event_rsvps')
          .upsert(
            { event_id: event.id, user_id: userId, status },
            { onConflict: 'event_id,user_id' },
          );
        if (error) throw error;
      }
      await loadEvents();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'RSVP could not be updated.');
    } finally {
      setRsvpBusy(null);
    }
  };

  const togglePersonal = async (profileId: string) => {
    if (!userId || saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const selected = personalIds.includes(profileId);
      const result = selected
        ? await supabase
            .from('event_personal_selections')
            .delete()
            .eq('user_id', userId)
            .eq('followed_user_id', profileId)
        : await supabase
            .from('event_personal_selections')
            .insert({ user_id: userId, followed_user_id: profileId });
      if (result.error) throw result.error;
      setPersonalIds((current) =>
        selected ? current.filter((id) => id !== profileId) : [...current, profileId],
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Personal list could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const searchProfiles = async () => {
    const query = profileSearch.trim().replace(/[%_]/g, ' ');
    if (!query || !userId) {
      setProfileResults([]);
      return;
    }
    setSearchingProfiles(true);
    try {
      const [usernameMatches, nameMatches] = await Promise.all([
        supabase
          .from('profiles')
          .select('id,username,full_name,avatar_url')
          .neq('id', userId)
          .ilike('username', `%${query}%`)
          .order('username', { ascending: true })
          .limit(12),
        supabase
          .from('profiles')
          .select('id,username,full_name,avatar_url')
          .neq('id', userId)
          .ilike('full_name', `%${query}%`)
          .order('username', { ascending: true })
          .limit(12),
      ]);
      if (usernameMatches.error) throw usernameMatches.error;
      if (nameMatches.error) throw nameMatches.error;
      const unique = new Map<string, ProfileRecord>();
      for (const profile of [...(usernameMatches.data ?? []), ...(nameMatches.data ?? [])]) {
        unique.set(profile.id, profile as ProfileRecord);
      }
      setProfileResults([...unique.values()].slice(0, 12));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'People could not be searched.');
    } finally {
      setSearchingProfiles(false);
    }
  };

  const blockProfile = async (profile: ProfileRecord) => {
    if (!userId || saving) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase
        .from('event_blocks')
        .insert({ blocker_id: userId, blocked_id: profile.id });
      if (error && error.code !== '23505') throw error;
      setSearchPeopleVisible(false);
      setProfileSearch('');
      setProfileResults([]);
      setMenuEventId(null);
      await loadEvents();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'This person could not be blocked in Events.');
    } finally {
      setSaving(false);
    }
  };

  const unblockProfile = async (profileId: string) => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('event_blocks')
        .delete()
        .eq('blocker_id', userId)
        .eq('blocked_id', profileId);
      if (error) throw error;
      await loadEvents();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Event block could not be removed.');
    } finally {
      setSaving(false);
    }
  };

  const featuredEvent = activeEvents[0] ?? null;
  const upcomingEvents = featuredEvent ? activeEvents.slice(1) : [];
  const openMeeting = (url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    void Linking.openURL(url).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Could not open the meeting link.');
    });
  };

  return (
    <View style={lumoStyles.page}>
      <ScrollView
        style={lumoStyles.pageScroll}
        contentContainerStyle={lumoStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[lumoStyles.pageInner, !desktop && lumoStyles.pageInnerNarrow, contentWidth < 400 && lumoStyles.pageInnerPhone]}>
          <View style={[lumoStyles.header, !tablet && lumoStyles.headerStacked]}>
            <View style={lumoStyles.headerCopy}>
              <Text style={[lumoStyles.pageTitle, contentWidth < 400 && lumoStyles.pageTitlePhone]}>Events</Text>
            </View>
            <View style={lumoStyles.headerActions}>
              <Pressable onPress={() => openCreate()} style={lumoStyles.createButton} accessibilityRole="button" accessibilityLabel="Create event">
                <Ionicons name="add" color={resolveThemeColor("#0B1016", "color")} size={19} />
                <Text style={lumoStyles.createButtonText}>{compact ? 'Create' : 'Create event'}</Text>
              </Pressable>
              <Pressable
                onPress={() => setActionsMenuVisible(true)}
                style={lumoStyles.headerMenuButton}
                accessibilityRole="button"
                accessibilityLabel="More Events options"
                accessibilityHint="Opens following, block and feed settings"
              >
                <Ionicons name="menu-outline" color={colors.text} size={23} />
              </Pressable>
            </View>
          </View>

          {errorMessage ? (
            <View style={lumoStyles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={17} color={resolveThemeColor("#F1A0A0", "color")} />
              <Text style={lumoStyles.errorText}>{errorMessage}</Text>
              <Pressable onPress={() => setErrorMessage(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          <View style={[lumoStyles.columns, !desktop && lumoStyles.columnsStacked]}>
            <View style={lumoStyles.mainColumn}>
              <View style={lumoStyles.toolbar}>
                <View style={lumoStyles.segmented}>
                  <Pressable
                    onPress={() => setActiveTab('all')}
                    style={[lumoStyles.segment, activeTab === 'all' && lumoStyles.segmentActive]}
                  >
                    <Text style={[lumoStyles.segmentText, activeTab === 'all' && lumoStyles.segmentTextActive]}>All</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTab('personal')}
                    style={[lumoStyles.segment, activeTab === 'personal' && lumoStyles.segmentActive]}
                  >
                    <Text style={[lumoStyles.segmentText, activeTab === 'personal' && lumoStyles.segmentTextActive]}>Personal</Text>
                    {personalIds.length > 0 ? (
                      <View style={lumoStyles.segmentCount}><Text style={lumoStyles.segmentCountText}>{personalIds.length}</Text></View>
                    ) : null}
                  </Pressable>
                </View>
              </View>

              <View style={lumoStyles.searchRow}>
                <Ionicons name="search-outline" size={18} color={colors.dim} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search events, places or people"
                  placeholderTextColor={colors.dim}
                  style={lumoStyles.searchInput}
                  returnKeyType="search"
                />
                {searchText ? (
                  <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={colors.dim} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView
                horizontal
                style={lumoStyles.categoryScroller}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={lumoStyles.categoryRail}
              >
                <Pressable
                  onPress={() => setActiveCategory('all')}
                  style={[lumoStyles.categoryChip, activeCategory === 'all' && lumoStyles.categoryChipActive]}
                >
                  <Text style={[lumoStyles.categoryChipText, activeCategory === 'all' && lumoStyles.categoryChipTextActive]}>All events</Text>
                </Pressable>
                {categoryOptions.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setActiveCategory((current) => current === item.key ? 'all' : item.key)}
                    style={[lumoStyles.categoryChip, activeCategory === item.key && lumoStyles.categoryChipActive]}
                  >
                    <Ionicons name={item.icon} size={14} color={activeCategory === item.key ? eventColors.accent : colors.muted} />
                    <Text style={[lumoStyles.categoryChipText, activeCategory === item.key && lumoStyles.categoryChipTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {loading ? (
                <View style={lumoStyles.loadingState}>
                  <ActivityIndicator color={eventColors.accent} size="large" />
                  <Text style={lumoStyles.loadingText}>Finding your next event…</Text>
                </View>
              ) : !userId ? (
                <EmptyState icon="calendar-outline" title="Sign in to explore events" body="Follow people and find out what they are planning." />
              ) : activeEvents.length === 0 ? (
                <EmptyState
                  icon={activeTab === 'personal' ? 'options-outline' : 'calendar-outline'}
                  title={activeTab === 'personal' ? 'Your Personal list is quiet' : 'No upcoming events'}
                  body={
                    activeTab === 'personal'
                      ? 'Select people for your feed.'
                      : 'No events from your circle yet.'
                  }
                  actionLabel={activeTab === 'personal' ? 'Choose people' : undefined}
                  onAction={activeTab === 'personal' ? () => setPersonalVisible(true) : undefined}
                />
              ) : (
                <>
                  {featuredEvent ? (
                    <View style={[lumoStyles.featuredCard, !tablet && lumoStyles.featuredCardStacked]}>
                      <View style={[lumoStyles.featuredImageWrap, !tablet && lumoStyles.featuredImageWrapStacked]}>
                        {featuredEvent.cover_url ? (
                          <Image source={{ uri: featuredEvent.cover_url }} style={[lumoStyles.featuredImage, !tablet && lumoStyles.featuredImageStacked]} contentFit="cover" />
                        ) : (
                          <View style={[lumoStyles.featuredImage, lumoStyles.featuredImageFallback, !tablet && lumoStyles.featuredImageStacked]}>
                            <Ionicons name={categoryOptions.find((item) => item.key === featuredEvent.category)?.icon ?? 'calendar-outline'} size={54} color={resolveThemeColor("rgba(255,255,255,0.8)", "color")} />
                            <Text style={lumoStyles.fallbackWord}>{categoryNames[featuredEvent.category] ?? 'EVENT'}</Text>
                          </View>
                        )}
                        <View style={lumoStyles.imageShade} />
                        <View style={lumoStyles.featuredLabel}><Text style={lumoStyles.featuredLabelText}>UP NEXT</Text></View>
                      </View>
                      <View style={[lumoStyles.featuredContent, !tablet && lumoStyles.featuredContentStacked]}>
                        <View style={lumoStyles.featuredTopline}>
                          <Text style={lumoStyles.categoryKicker}>{categoryNames[featuredEvent.category] ?? 'EVENT'}</Text>
                          <EventMenu
                            event={featuredEvent}
                            userId={userId}
                            open={menuEventId === featuredEvent.id}
                            onToggle={() => setMenuEventId(menuEventId === featuredEvent.id ? null : featuredEvent.id)}
                            onEdit={() => openCreate(featuredEvent)}
                            onDelete={() => setDeleteTarget(featuredEvent)}
                            onBlock={() => featuredEvent.host && void blockProfile(featuredEvent.host)}
                          />
                        </View>
                        <Text style={lumoStyles.featuredTitle}>{featuredEvent.title}</Text>
                        {featuredEvent.description ? (
                          <Text style={lumoStyles.featuredDescription} numberOfLines={3}>{featuredEvent.description}</Text>
                        ) : null}
                        <HostLine profile={featuredEvent.host} />
                        <View style={lumoStyles.eventMetaGrid}>
                          <MetaLine icon="calendar-outline" primary={eventDate(featuredEvent.starts_at)} secondary={eventTime(featuredEvent.starts_at)} />
                          <MetaLine
                            icon={featuredEvent.meeting_url ? 'videocam-outline' : 'location-outline'}
                            primary={featuredEvent.meeting_url ? 'Online event' : featuredEvent.location || 'Location not set'}
                            secondary={featuredEvent.meeting_url ? 'Meeting link available' : ''}
                          />
                          <MetaLine icon="people-outline" primary={String(featuredEvent.goingCount)} secondary="going" />
                        </View>
                        <View style={lumoStyles.featuredActions}>
                          <RsvpButton
                            label="Going"
                            icon="checkmark"
                            selected={featuredEvent.myStatus === 'going'}
                            busy={rsvpBusy === featuredEvent.id}
                            onPress={() => void updateRsvp(featuredEvent, 'going')}
                          />
                          <RsvpButton
                            label="Interested"
                            icon="star-outline"
                            selected={featuredEvent.myStatus === 'interested'}
                            busy={rsvpBusy === featuredEvent.id}
                            outline
                            onPress={() => void updateRsvp(featuredEvent, 'interested')}
                          />
                          {featuredEvent.meeting_url ? (
                            <Pressable onPress={() => openMeeting(featuredEvent.meeting_url!)} style={lumoStyles.meetingButton}>
                              <Ionicons name="open-outline" size={16} color={colors.text} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <View style={lumoStyles.listHeading}>
                    <Text style={lumoStyles.sectionTitle}>Upcoming</Text>
                    <View style={lumoStyles.sectionCount}>
                      <Text style={lumoStyles.sectionCountText}>{activeEvents.length}</Text>
                    </View>
                  </View>

                  <View style={lumoStyles.eventList}>
                    {(featuredEvent ? upcomingEvents : activeEvents).map((event) => (
                      <EventListItem
                        key={event.id}
                        event={event}
                        userId={userId}
                        compact={compact}
                        menuOpen={menuEventId === event.id}
                        rsvpBusy={rsvpBusy === event.id}
                        onMenu={() => setMenuEventId(menuEventId === event.id ? null : event.id)}
                        onEdit={() => openCreate(event)}
                        onDelete={() => setDeleteTarget(event)}
                        onBlock={() => event.host && void blockProfile(event.host)}
                        onRsvp={(status) => void updateRsvp(event, status)}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>

            <View style={[lumoStyles.sideColumn, !desktop && lumoStyles.sideColumnNarrow]}>
              <View style={lumoStyles.sideHeading}>
                <Text style={lumoStyles.sideTitle}>My events</Text>
                <View style={lumoStyles.sideCount}>
                  <Text style={lumoStyles.sideCountText}>{visibleMyEvents.length}</Text>
                </View>
              </View>

              {visibleMyEvents.length ? (
                <View style={lumoStyles.myEventList}>
                  {visibleMyEvents.map((event) => (
                    <View key={event.id} style={lumoStyles.myEventRow}>
                      <View style={lumoStyles.smallDateBlock}>
                        <Text style={lumoStyles.smallDateMonth}>{monthShort(event.starts_at)}</Text>
                        <Text style={lumoStyles.smallDateDay}>{dayNumber(event.starts_at)}</Text>
                      </View>
                      <View style={lumoStyles.myEventCopy}>
                        <Text numberOfLines={1} style={lumoStyles.myEventTitle}>{event.title}</Text>
                        <Text style={lumoStyles.myEventDate}>{eventDate(event.starts_at)} · {eventTime(event.starts_at)}</Text>
                        <Text style={lumoStyles.myEventCount}>{event.goingCount} going · {event.interestedCount} interested</Text>
                      </View>
                      <Pressable onPress={() => setMenuEventId(menuEventId === event.id ? null : event.id)} style={lumoStyles.moreButton}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                      </Pressable>
                      {menuEventId === event.id ? (
                        <View style={lumoStyles.myEventMenu}>
                          <Pressable onPress={() => openCreate(event)} style={lumoStyles.menuItem}>
                            <Ionicons name="create-outline" size={16} color={colors.text} />
                            <Text style={lumoStyles.menuItemText}>Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => setDeleteTarget(event)} style={lumoStyles.menuItem}>
                            <Ionicons name="trash-outline" size={16} color={resolveThemeColor("#E08C8C", "color")} />
                            <Text style={[lumoStyles.menuItemText, { color: resolveThemeColor("#E08C8C", "color") }]}>Delete</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={lumoStyles.myEventsEmpty}>
                  <Ionicons name="calendar-outline" size={18} color={colors.dim} />
                  <Text style={lumoStyles.myEventsEmptyText}>No hosted events</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={actionsMenuVisible} transparent animationType="fade" onRequestClose={() => setActionsMenuVisible(false)}>
        <View style={lumoStyles.actionsMenuBackdrop}>
          <Pressable style={lumoStyles.actionsMenuScrim} onPress={() => setActionsMenuVisible(false)} />
          <View style={lumoStyles.actionsMenuSheet}>
            <View style={lumoStyles.actionsMenuHandle} />
            <View style={lumoStyles.actionsMenuHeader}>
              <Text style={lumoStyles.actionsMenuTitle}>Event settings</Text>
              <Pressable onPress={() => setActionsMenuVisible(false)} style={lumoStyles.modalClose} accessibilityLabel="Close menu">
                <Ionicons name="close" size={19} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable style={lumoStyles.actionsMenuItem} onPress={() => { setActionsMenuVisible(false); setPersonalVisible(true); }}>
              <View style={lumoStyles.actionsMenuIcon}><Ionicons name="people-outline" size={19} color={eventColors.accent} /></View>
              <View style={lumoStyles.actionsMenuCopy}>
                <Text style={lumoStyles.actionsMenuItemTitle}>Personal list</Text>
                <Text style={lumoStyles.actionsMenuItemMeta}>{personalIds.length} people selected</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Pressable>
            <Pressable style={lumoStyles.actionsMenuItem} onPress={() => { setActionsMenuVisible(false); setBlocksVisible(true); }}>
              <View style={lumoStyles.actionsMenuIcon}><Ionicons name="shield-checkmark-outline" size={19} color={eventColors.accent} /></View>
              <View style={lumoStyles.actionsMenuCopy}>
                <Text style={lumoStyles.actionsMenuItemTitle}>Blocked people</Text>
                <Text style={lumoStyles.actionsMenuItemMeta}>{blockedIds.length} blocked</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Pressable>
            <Pressable style={lumoStyles.actionsMenuItem} onPress={() => { setActionsMenuVisible(false); void loadEvents(); }}>
              <View style={lumoStyles.actionsMenuIcon}><Ionicons name="refresh-outline" size={19} color={eventColors.accent} /></View>
              <View style={lumoStyles.actionsMenuCopy}>
                <Text style={lumoStyles.actionsMenuItemTitle}>Refresh events</Text>
                <Text style={lumoStyles.actionsMenuItemMeta}>Get the latest from your circle</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Pressable>
            <Pressable style={[lumoStyles.actionsMenuItem, lumoStyles.actionsMenuItemLast]} onPress={() => { setActionsMenuVisible(false); setSearchText(''); setActiveCategory('all'); setActiveTab('all'); }}>
              <View style={lumoStyles.actionsMenuIcon}><Ionicons name="options-outline" size={19} color={eventColors.accent} /></View>
              <View style={lumoStyles.actionsMenuCopy}>
                <Text style={lumoStyles.actionsMenuItemTitle}>Clear filters</Text>
                <Text style={lumoStyles.actionsMenuItemMeta}>Reset search and category</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.dim} />
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={lumoStyles.modalBackdrop}>
          <View style={[lumoStyles.modalCard, lumoStyles.createModal, tablet && lumoStyles.createModalWide]}>
            <ModalHeader
              eyebrow={editingEvent ? 'YOUR EVENT' : 'BRING PEOPLE TOGETHER'}
              title={editingEvent ? 'Edit event' : 'Create event'}
              subtitle="Add the details and publish."
              onClose={() => setCreateVisible(false)}
            />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={lumoStyles.formContent}>
              <FieldLabel label="Event name" hint="Required" />
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="What are you planning?"
                placeholderTextColor={colors.dim}
                style={lumoStyles.input}
                maxLength={120}
              />

              <FieldLabel label="Category" />
              <View style={lumoStyles.categoryGrid}>
                {categoryOptions.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setFormCategory(item.key)}
                    style={[lumoStyles.formCategory, formCategory === item.key && lumoStyles.formCategoryActive]}
                  >
                    <Ionicons name={item.icon} size={16} color={formCategory === item.key ? eventColors.accent : colors.muted} />
                    <Text style={[lumoStyles.formCategoryText, formCategory === item.key && lumoStyles.formCategoryTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <FieldLabel label="Description" hint="Optional" />
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Give people a little context…"
                placeholderTextColor={colors.dim}
                style={[lumoStyles.input, lumoStyles.multilineInput]}
                multiline
                maxLength={1200}
                textAlignVertical="top"
              />

              <FieldLabel label="When does it start?" hint="Your local time" />
              <View style={lumoStyles.dateTimeRow}>
                <View style={lumoStyles.dateField}>
                  <Text style={lumoStyles.inputMiniLabel}>DATE</Text>
                  <View style={lumoStyles.inputIconWrap}>
                    <Ionicons name="calendar-outline" size={16} color={eventColors.accent} />
                    <TextInput
                      value={formDate}
                      onChangeText={setFormDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.dim}
                      style={lumoStyles.dateTimeInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                  </View>
                </View>
                <View style={lumoStyles.timeField}>
                  <Text style={lumoStyles.inputMiniLabel}>TIME</Text>
                  <View style={lumoStyles.inputIconWrap}>
                    <Ionicons name="time-outline" size={16} color={eventColors.accent} />
                    <TextInput
                      value={formTime}
                      onChangeText={setFormTime}
                      placeholder="18:30"
                      placeholderTextColor={colors.dim}
                      style={lumoStyles.dateTimeInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>
              <View style={lumoStyles.timeHint}><Ionicons name="information-circle-outline" size={14} color={colors.dim} /><Text style={lumoStyles.timeHintText}>Example: 2026-11-19 · 18:30. Event automatically expires one hour after this time.</Text></View>

              <FieldLabel label="Location" hint="Optional" />
              <TextInput value={formLocation} onChangeText={setFormLocation} placeholder="Venue, address or meeting point" placeholderTextColor={colors.dim} style={lumoStyles.input} maxLength={180} />

              <FieldLabel label="Online meeting link" hint="Optional" />
              <TextInput value={formMeetingUrl} onChangeText={setFormMeetingUrl} placeholder="https://…" placeholderTextColor={colors.dim} style={lumoStyles.input} autoCapitalize="none" keyboardType="url" />

              <FieldLabel label="Event cover" hint="Optional · 16:9" />
              <Pressable onPress={() => void chooseCover()} style={lumoStyles.coverPicker}>
                {coverUri || formCoverUrl ? (
                  <Image source={{ uri: coverUri || formCoverUrl }} style={lumoStyles.coverPreview} contentFit="cover" />
                ) : (
                  <View style={lumoStyles.coverPlaceholder}>
                    <Ionicons name="image-outline" size={27} color={eventColors.accent} />
                    <Text style={lumoStyles.coverPlaceholderText}>Choose a cover image</Text>
                    <Text style={lumoStyles.coverPlaceholderHint}>Select a photo from your gallery</Text>
                  </View>
                )}
                <View style={lumoStyles.coverPickerBadge}>
                  <Ionicons name="images-outline" size={15} color={resolveThemeColor("#0B1016", "color")} />
                  <Text style={lumoStyles.coverPickerBadgeText}>{coverUri || formCoverUrl ? 'Change cover' : 'Choose image'}</Text>
                </View>
              </Pressable>
              <TextInput
                value={formCoverUrl}
                onChangeText={(value) => { setFormCoverUrl(value); setCoverUri(null); }}
                placeholder="Or paste an image URL"
                placeholderTextColor={colors.dim}
                style={lumoStyles.input}
                autoCapitalize="none"
                keyboardType="url"
              />
              {coverUri || formCoverUrl ? (
                <Pressable onPress={() => { setCoverUri(null); setFormCoverUrl(''); }} style={lumoStyles.removeCoverButton}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.muted} />
                  <Text style={lumoStyles.removeCoverText}>Remove cover</Text>
                </Pressable>
              ) : null}

              <View style={lumoStyles.formInfo}>
                <Ionicons name="eye-outline" size={17} color={eventColors.accent} />
                <Text style={lumoStyles.formInfoText}>Your event appears in followers’ All feed. People who select you in Personal will see it there too.</Text>
              </View>
              <View style={lumoStyles.modalActions}>
                <Pressable onPress={() => setCreateVisible(false)} style={lumoStyles.cancelButton}><Text style={lumoStyles.cancelButtonText}>Cancel</Text></Pressable>
                <Pressable onPress={() => void saveEvent()} disabled={saving} style={[lumoStyles.submitButton, saving && lumoStyles.disabledButton]}>
                  {saving ? <ActivityIndicator color={resolveThemeColor("#0B1016", "color")} size="small" /> : <Ionicons name="checkmark" size={18} color={resolveThemeColor("#0B1016", "color")} />}
                  <Text style={lumoStyles.submitButtonText}>{editingEvent ? 'Save changes' : 'Publish event'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={personalVisible} transparent animationType="fade" onRequestClose={() => setPersonalVisible(false)}>
        <View style={lumoStyles.modalBackdrop}>
          <View style={[lumoStyles.modalCard, lumoStyles.peopleModal]}>
            <ModalHeader eyebrow="YOUR CIRCLE" title="Personal feed" subtitle="Choose people you follow. Only their events will appear in Personal." onClose={() => setPersonalVisible(false)} />
            {followings.length ? (
              <ScrollView style={lumoStyles.peopleList} showsVerticalScrollIndicator={false}>
                {followings.map((profile) => {
                  const selected = personalIds.includes(profile.id);
                  return (
                    <Pressable key={profile.id} onPress={() => void togglePersonal(profile.id)} style={lumoStyles.peopleRow}>
                      <Avatar uri={profile.avatar_url} name={displayName(profile)} size={42} />
                      <View style={lumoStyles.peopleCopy}>
                        <Text style={lumoStyles.peopleName}>{displayName(profile)}</Text>
                        <Text style={lumoStyles.peopleUsername}>@{profile.username}</Text>
                      </View>
                      <View style={[lumoStyles.selectionBox, selected && lumoStyles.selectionBoxSelected]}>
                        {selected ? <Ionicons name="checkmark" size={15} color={resolveThemeColor("#0B1016", "color")} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState icon="people-outline" title="No followings yet" body="Follow people first. You can then add them to your Personal event feed." />
            )}
            <View style={lumoStyles.modalFooter}>
              <Text style={lumoStyles.modalFootnote}>{personalIds.length} people selected</Text>
              <Pressable onPress={() => setPersonalVisible(false)} style={lumoStyles.submitButton}><Text style={lumoStyles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={blocksVisible} transparent animationType="fade" onRequestClose={() => setBlocksVisible(false)}>
        <View style={lumoStyles.modalBackdrop}>
          <View style={[lumoStyles.modalCard, lumoStyles.peopleModal]}>
            <ModalHeader eyebrow="EVENT PRIVACY" title="Manage event blocks" subtitle="Blocked accounts cannot see your events, and you cannot see theirs. This does not block their profile." onClose={() => setBlocksVisible(false)} />
            <Pressable onPress={() => { setBlocksVisible(false); setSearchPeopleVisible(true); }} style={lumoStyles.addBlockButton}>
              <Ionicons name="person-add-outline" size={17} color={resolveThemeColor("#0B1016", "color")} />
              <Text style={lumoStyles.addBlockButtonText}>Block someone in Events</Text>
            </Pressable>
            <Text style={lumoStyles.modalSectionLabel}>EVENT VISIBILITY</Text>
            {blockedIds.length ? (
              <ScrollView style={lumoStyles.peopleList} showsVerticalScrollIndicator={false}>
                {blockedIds.map((id) => {
                  const profile = blockProfiles.find((item) => item.id === id);
                  const blockedByMe = blockRows.some((row) => row.blocker_id === userId && row.blocked_id === id);
                  return (
                    <View key={id} style={lumoStyles.peopleRow}>
                      <Avatar uri={profile?.avatar_url} name={displayName(profile)} size={42} />
                      <View style={lumoStyles.peopleCopy}>
                        <Text style={lumoStyles.peopleName}>{displayName(profile)}</Text>
                        <Text style={lumoStyles.peopleUsername}>{blockedByMe ? 'You blocked their events' : 'They blocked event visibility'}</Text>
                      </View>
                      {blockedByMe ? (
                        <Pressable onPress={() => void unblockProfile(id)} style={lumoStyles.unblockButton}><Text style={lumoStyles.unblockText}>Unblock</Text></Pressable>
                      ) : (
                        <View style={lumoStyles.readOnlyTag}><Text style={lumoStyles.readOnlyTagText}>Restricted</Text></View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState icon="shield-checkmark-outline" title="No event blocks" body="People you block here will only be hidden from your Events experience." />
            )}
            <View style={lumoStyles.modalFooter}>
              <Text style={lumoStyles.modalFootnote}>{blockedIds.length} account{blockedIds.length === 1 ? '' : 's'}</Text>
              <Pressable onPress={() => setBlocksVisible(false)} style={lumoStyles.submitButton}><Text style={lumoStyles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={searchPeopleVisible} transparent animationType="fade" onRequestClose={() => setSearchPeopleVisible(false)}>
        <View style={lumoStyles.modalBackdrop}>
          <View style={[lumoStyles.modalCard, lumoStyles.peopleModal]}>
            <ModalHeader eyebrow="EVENT PRIVACY" title="Block an account" subtitle="Search any LUMO user. This only affects events." onClose={() => setSearchPeopleVisible(false)} />
            <View style={lumoStyles.searchPeopleRow}>
              <Ionicons name="search-outline" size={18} color={colors.dim} />
              <TextInput
                value={profileSearch}
                onChangeText={setProfileSearch}
                placeholder="Search username or name"
                placeholderTextColor={colors.dim}
                style={lumoStyles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => void searchProfiles()}
              />
              <Pressable onPress={() => void searchProfiles()} style={lumoStyles.searchAction}>
                {searchingProfiles ? <ActivityIndicator size="small" color={resolveThemeColor("#0B1016", "color")} /> : <Ionicons name="arrow-forward" size={17} color={resolveThemeColor("#0B1016", "color")} />}
              </Pressable>
            </View>
            <ScrollView style={lumoStyles.peopleList} keyboardShouldPersistTaps="handled">
              {profileResults.map((profile) => {
                const alreadyBlocked = blockRows.some((row) =>
                  (row.blocker_id === userId && row.blocked_id === profile.id) ||
                  (row.blocker_id === profile.id && row.blocked_id === userId),
                );
                return (
                  <View key={profile.id} style={lumoStyles.peopleRow}>
                    <Avatar uri={profile.avatar_url} name={displayName(profile)} size={42} />
                    <View style={lumoStyles.peopleCopy}>
                      <Text style={lumoStyles.peopleName}>{displayName(profile)}</Text>
                      <Text style={lumoStyles.peopleUsername}>@{profile.username}</Text>
                    </View>
                    <Pressable
                      disabled={alreadyBlocked || saving}
                      onPress={() => void blockProfile(profile)}
                      style={[lumoStyles.blockAction, alreadyBlocked && lumoStyles.blockActionDisabled]}
                    >
                      <Text style={[lumoStyles.blockActionText, alreadyBlocked && lumoStyles.blockActionTextDisabled]}>{alreadyBlocked ? 'Blocked' : 'Block'}</Text>
                    </Pressable>
                  </View>
                );
              })}
              {!profileResults.length && profileSearch.trim() ? (
                <Text style={lumoStyles.noSearchResults}>Search for a LUMO username or full name.</Text>
              ) : null}
            </ScrollView>
            <View style={lumoStyles.modalFooter}>
              <Text style={lumoStyles.modalFootnote}>Event-only. Profiles and chats stay unchanged.</Text>
              <Pressable onPress={() => setSearchPeopleVisible(false)} style={lumoStyles.submitButton}><Text style={lumoStyles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={lumoStyles.modalBackdrop}>
          <View style={[lumoStyles.modalCard, lumoStyles.confirmModal]}>
            <View style={lumoStyles.confirmIcon}><Ionicons name="trash-outline" size={25} color={resolveThemeColor("#E08C8C", "color")} /></View>
            <Text style={lumoStyles.confirmTitle}>Delete this event?</Text>
            <Text style={lumoStyles.confirmBody}>“{deleteTarget?.title}” will be removed for everyone. This cannot be undone.</Text>
            <View style={lumoStyles.modalActions}>
              <Pressable onPress={() => setDeleteTarget(null)} style={lumoStyles.cancelButton}><Text style={lumoStyles.cancelButtonText}>Keep event</Text></Pressable>
              <Pressable onPress={() => void deleteEvent()} disabled={saving} style={lumoStyles.deleteConfirmButton}>
                {saving ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="trash-outline" size={17} color={colors.text} />}
                <Text style={lumoStyles.deleteConfirmText}>Delete event</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function EventMenu({
  event,
  userId,
  open,
  onToggle,
  onEdit,
  onDelete,
  onBlock,
}: {
  event: EventWithHost;
  userId: string | null;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlock: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  const mine = event.host_id === userId;
  return (
    <View style={lumoStyles.eventMenuWrap}>
      <Pressable onPress={onToggle} style={lumoStyles.eventMenuButton}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={lumoStyles.eventMenuPopover}>
          {mine ? (
            <>
              <Pressable onPress={onEdit} style={lumoStyles.menuItem}><Ionicons name="create-outline" size={16} color={colors.text} /><Text style={lumoStyles.menuItemText}>Edit event</Text></Pressable>
              <Pressable onPress={onDelete} style={lumoStyles.menuItem}><Ionicons name="trash-outline" size={16} color={resolveThemeColor("#E08C8C", "color")} /><Text style={[lumoStyles.menuItemText, { color: resolveThemeColor("#E08C8C", "color") }]}>Delete event</Text></Pressable>
            </>
          ) : (
            <Pressable onPress={onBlock} style={lumoStyles.menuItem}><Ionicons name="shield-outline" size={16} color={resolveThemeColor("#E08C8C", "color")} /><Text style={[lumoStyles.menuItemText, { color: resolveThemeColor("#E08C8C", "color") }]}>Block events</Text></Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function HostLine({ profile }: { profile: ProfileRecord | null }) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.hostLine}>
      <Avatar uri={profile?.avatar_url} name={displayName(profile)} size={27} />
      <View style={lumoStyles.hostCopy}>
        <Text style={lumoStyles.hostName}>{displayName(profile)}</Text>
        {profile?.username ? <Text style={lumoStyles.hostUsername}>@{profile.username}</Text> : null}
      </View>
    </View>
  );
}

function MetaLine({
  icon,
  primary,
  secondary,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  primary: string;
  secondary: string;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.metaLine}>
      <Ionicons name={icon} size={17} color={eventColors.accent} />
      <View style={lumoStyles.metaCopy}>
        <Text numberOfLines={1} style={lumoStyles.metaPrimary}>{primary}</Text>
        {secondary ? <Text numberOfLines={1} style={lumoStyles.metaSecondary}>{secondary}</Text> : null}
      </View>
    </View>
  );
}

function RsvpButton({
  label,
  icon,
  selected,
  outline = false,
  busy = false,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  selected: boolean;
  outline?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[
        lumoStyles.rsvpButton,
        outline && lumoStyles.rsvpButtonOutline,
        selected && lumoStyles.rsvpButtonSelected,
        busy && lumoStyles.disabledButton,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={selected || !outline ? resolveThemeColor("#0B1016", "color") : colors.text} /> : <Ionicons name={selected ? 'checkmark' : icon} size={16} color={selected || !outline ? resolveThemeColor("#0B1016", "color") : colors.text} />}
      <Text style={[lumoStyles.rsvpText, outline && !selected && lumoStyles.rsvpTextOutline]}>{selected ? (label === 'Going' ? 'Going' : 'Interested') : label}</Text>
    </Pressable>
  );
}

function EventListItem({
  event,
  userId,
  compact,
  menuOpen,
  rsvpBusy,
  onMenu,
  onEdit,
  onDelete,
  onBlock,
  onRsvp,
}: {
  event: EventWithHost;
  userId: string;
  compact: boolean;
  menuOpen: boolean;
  rsvpBusy: boolean;
  onMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlock: () => void;
  onRsvp: (status: 'going' | 'interested') => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={[lumoStyles.eventListItem, compact && lumoStyles.eventListItemCompact]}>
      <View style={[lumoStyles.dateBlock, compact && lumoStyles.dateBlockCompact]}>
        <Text style={lumoStyles.dateMonth}>{monthShort(event.starts_at)}</Text>
        <Text style={lumoStyles.dateDay}>{dayNumber(event.starts_at)}</Text>
        <Text style={lumoStyles.dateWeekday}>{new Date(event.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
      </View>
      {event.cover_url ? (
        <Image source={{ uri: event.cover_url }} style={[lumoStyles.listThumb, compact && lumoStyles.listThumbCompact]} contentFit="cover" />
      ) : (
        <View style={[lumoStyles.listThumb, lumoStyles.listThumbFallback, compact && lumoStyles.listThumbCompact]}>
          <Ionicons name={categoryOptions.find((item) => item.key === event.category)?.icon ?? 'calendar-outline'} size={25} color={eventColors.accent} />
        </View>
      )}
      <View style={lumoStyles.listEventContent}>
        <View style={lumoStyles.listTitleRow}>
          <Text numberOfLines={1} style={lumoStyles.listEventTitle}>{event.title}</Text>
          <EventMenu
            event={event}
            userId={userId}
            open={menuOpen}
            onToggle={onMenu}
            onEdit={onEdit}
            onDelete={onDelete}
            onBlock={onBlock}
          />
        </View>
        <Text numberOfLines={1} style={lumoStyles.listDescription}>{event.description || categoryNames[event.category] || 'Community event'}</Text>
        <View style={lumoStyles.listMetaRow}>
          <Avatar uri={event.host?.avatar_url} name={displayName(event.host)} size={18} />
          <Text style={lumoStyles.listHostText}>{event.host?.username ? `@${event.host.username}` : displayName(event.host)}</Text>
          <Ionicons name="time-outline" size={13} color={colors.dim} />
          <Text style={lumoStyles.listMetaText}>{eventTime(event.starts_at)}</Text>
          <Ionicons name={event.meeting_url ? 'videocam-outline' : 'location-outline'} size={13} color={colors.dim} />
          <Text numberOfLines={1} style={lumoStyles.listMetaText}>{event.meeting_url ? 'Online' : event.location || 'Location TBA'}</Text>
        </View>
      </View>
      <View style={[lumoStyles.listEventActions, compact && lumoStyles.listEventActionsCompact]}>
        <Text style={lumoStyles.goingCount}><Ionicons name="people-outline" size={13} color={colors.muted} /> {event.goingCount}</Text>
        <Pressable
          onPress={() => onRsvp('going')}
          disabled={rsvpBusy}
          style={[lumoStyles.smallGoingButton, event.myStatus === 'going' && lumoStyles.smallGoingButtonActive]}
        >
          <Text style={[lumoStyles.smallGoingText, event.myStatus === 'going' && lumoStyles.smallGoingTextActive]}>{event.myStatus === 'going' ? 'Going' : 'Join'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.emptyState}>
      <View style={lumoStyles.emptyStateIcon}><Ionicons name={icon} size={29} color={eventColors.accent} /></View>
      <Text style={lumoStyles.emptyStateTitle}>{title}</Text>
      <Text style={lumoStyles.emptyStateBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={lumoStyles.emptyStateAction}>
          <Text style={lumoStyles.emptyStateActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color={resolveThemeColor("#0B1016", "color")} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ModalHeader({
  eyebrow,
  title,
  subtitle,
  onClose,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  onClose: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.modalHeader}>
      <View style={lumoStyles.modalHeaderCopy}>
        <Text style={lumoStyles.modalEyebrow}>{eyebrow}</Text>
        <Text style={lumoStyles.modalTitle}>{title}</Text>
        <Text style={lumoStyles.modalSubtitle}>{subtitle}</Text>
      </View>
      <Pressable onPress={onClose} style={lumoStyles.modalClose} accessibilityLabel="Close">
        <Ionicons name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.fieldLabelRow}>
      <Text style={lumoStyles.fieldLabel}>{label}</Text>
      {hint ? <Text style={lumoStyles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', minWidth: 0, maxWidth: '100%', alignSelf: 'stretch', backgroundColor: colors.bg, overflow: 'hidden' },
  pageScroll: { flex: 1, width: '100%', minWidth: 0, maxWidth: '100%', alignSelf: 'stretch' },
  scrollContent: { flexGrow: 1, width: '100%', minWidth: 0, alignSelf: 'stretch', paddingBottom: 28 },
  pageInner: { width: '100%', minWidth: 0, maxWidth: 1340, flexShrink: 1, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 28 },
  pageInnerNarrow: { paddingHorizontal: 20, paddingTop: 20 },
  pageInnerPhone: { paddingHorizontal: 14, paddingTop: 14 },
  header: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 22 },
  headerStacked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  pageTitle: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.1 },
  pageTitlePhone: { fontSize: 28, letterSpacing: -0.9 },
  createButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 12, backgroundColor: eventColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  createButtonText: { color: '#0B1016', fontWeight: '800', fontSize: 12 },
  headerMenuButton: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(224,140,140,0.25)', backgroundColor: 'rgba(224,140,140,0.08)', borderRadius: 12, marginBottom: 16 },
  errorText: { color: '#E7B2B2', fontSize: 12, flex: 1, lineHeight: 17 },
  columns: { width: '100%', minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  columnsStacked: { width: '100%', minWidth: 0, flexDirection: 'column', alignItems: 'stretch' },
  mainColumn: { flex: 1, width: '100%', minWidth: 0, maxWidth: '100%', flexShrink: 1 },
  sideColumn: { width: 312, minWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 25, paddingTop: 5 },
  sideColumnNarrow: { width: '100%', maxWidth: '100%', minWidth: 0, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: colors.border, paddingLeft: 0, paddingTop: 17, marginTop: 14 },
  toolbar: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  segmented: { height: 44, flexDirection: 'row', alignItems: 'center', padding: 3, backgroundColor: '#10151C', borderWidth: 1, borderColor: '#29323D', borderRadius: 14, alignSelf: 'flex-start' },
  segment: { minWidth: 96, height: 36, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  segmentActive: { backgroundColor: eventColors.accentSoft, borderWidth: 1, borderColor: eventColors.line },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: eventColors.accent },
  segmentCount: { backgroundColor: eventColors.accent, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentCountText: { color: '#0B1016', fontSize: 9, fontWeight: '900' },
  searchRow: { width: '100%', maxWidth: '100%', minWidth: 0, height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#10151C', borderWidth: 1, borderColor: '#28323E', flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, paddingVertical: 8, outlineStyle: 'none' as never },
  categoryScroller: { width: '100%', maxWidth: '100%', minWidth: 0, flexGrow: 0, flexShrink: 0, alignSelf: 'stretch', overflow: 'hidden' },
  categoryRail: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingBottom: 13, paddingRight: 14 },
  categoryChip: { minHeight: 35, paddingHorizontal: 13, borderRadius: 11, borderWidth: 1, borderColor: '#2A3440', backgroundColor: '#11161D', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  categoryChipActive: { borderColor: eventColors.line, backgroundColor: eventColors.accentSoft },
  categoryChipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  categoryChipTextActive: { color: eventColors.accent },
  loadingState: { width: '100%', minWidth: 0, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#11161D', borderRadius: 18, borderWidth: 1, borderColor: '#2A3440' },
  loadingText: { color: colors.muted, fontSize: 13 },
  featuredCard: { width: '100%', maxWidth: '100%', minWidth: 0, flexShrink: 1, backgroundColor: '#121820', borderRadius: 20, borderWidth: 1, borderColor: '#303B48', overflow: 'hidden', flexDirection: 'row', minHeight: 300, marginBottom: 23 },
  featuredCardStacked: { flexDirection: 'column', minHeight: 0 },
  featuredImageWrap: { width: '35%', minWidth: 200, position: 'relative', backgroundColor: colors.surfaceRaised },
  featuredImageWrapStacked: { width: '100%', minWidth: 0, height: 176 },
  featuredImage: { width: '100%', height: '100%', minHeight: 300 },
  featuredImageStacked: { height: 176, minHeight: 176 },
  featuredImageFallback: { alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#1A222C' },
  fallbackWord: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  imageShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(14,12,10,0.12)' },
  featuredLabel: { position: 'absolute', top: 15, left: 15, backgroundColor: eventColors.accent, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  featuredLabelText: { color: '#0B1016', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  featuredContent: { flex: 1, minWidth: 0, padding: 20, justifyContent: 'center' },
  featuredContentStacked: { padding: 16 },
  featuredTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryKicker: { color: eventColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  featuredTitle: { color: '#F2F5F7', fontSize: 24, fontWeight: '800', letterSpacing: -0.7, lineHeight: 30, marginTop: 8 },
  featuredDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 7 },
  hostLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 13 },
  hostCopy: { flexDirection: 'column', minWidth: 0 },
  hostName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  hostUsername: { color: colors.dim, fontSize: 10, marginTop: 2 },
  eventMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginTop: 15 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 90, flexShrink: 1 },
  metaCopy: { flexDirection: 'column', minWidth: 0, flexShrink: 1 },
  metaPrimary: { color: colors.text, fontSize: 11, fontWeight: '700' },
  metaSecondary: { color: colors.dim, fontSize: 10, marginTop: 3 },
  featuredActions: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 17, flexWrap: 'wrap' },
  rsvpButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 16, backgroundColor: eventColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  rsvpButtonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  rsvpButtonSelected: { backgroundColor: '#D7DEE6', borderColor: '#D7DEE6' },
  rsvpText: { color: '#0B1016', fontSize: 11, fontWeight: '900' },
  rsvpTextOutline: { color: colors.text },
  meetingButton: { height: 38, width: 38, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  listHeading: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 },
  sectionTitle: { color: '#F2F5F7', fontSize: 19, fontWeight: '800', letterSpacing: -0.45 },
  sectionCount: { minWidth: 23, height: 23, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  sectionCountText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  eventList: { width: '100%', minWidth: 0, borderTopWidth: 1, borderTopColor: '#29323D' },
  eventListItem: { width: '100%', minWidth: 0, minHeight: 105, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  eventListItemCompact: { minHeight: 0, paddingVertical: 12, gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  dateBlock: { width: 52, alignItems: 'center', justifyContent: 'center' },
  dateBlockCompact: { width: 38 },
  dateMonth: { color: eventColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  dateDay: { color: '#F2F5F7', fontSize: 25, fontWeight: '800', lineHeight: 29, marginTop: 1 },
  dateWeekday: { color: colors.dim, fontSize: 9, marginTop: 1 },
  listThumb: { width: 78, height: 76, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  listThumbCompact: { width: 56, height: 56 },
  listThumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A222C' },
  listEventContent: { flex: 1, minWidth: 0 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listEventTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  listDescription: { color: colors.muted, fontSize: 10, marginTop: 4 },
  listMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  listHostText: { color: colors.muted, fontSize: 9, marginRight: 6 },
  listMetaText: { color: colors.dim, fontSize: 9, maxWidth: 120 },
  listEventActions: { alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  listEventActionsCompact: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 110 },
  goingCount: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  smallGoingButton: { borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  smallGoingButtonActive: { borderColor: eventColors.line, backgroundColor: eventColors.accentSoft },
  smallGoingText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  smallGoingTextActive: { color: eventColors.accent },
  eventMenuWrap: { position: 'relative', zIndex: 4 },
  eventMenuButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  eventMenuPopover: { position: 'absolute', zIndex: 15, right: 0, top: 32, minWidth: 145, padding: 5, backgroundColor: colors.surfaceRaised, borderRadius: 11, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, elevation: 8 },
  menuItem: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, borderRadius: 8 },
  menuItemText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  sideHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sideTitle: { color: '#F2F5F7', fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  sideCount: { minWidth: 25, height: 25, borderRadius: 9, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: eventColors.accentSoft, borderWidth: 1, borderColor: eventColors.line },
  sideCountText: { color: eventColors.accent, fontSize: 10, fontWeight: '900' },
  myEventList: { gap: 2 },
  myEventRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, position: 'relative' },
  smallDateBlock: { width: 38, alignItems: 'center' },
  smallDateMonth: { color: eventColors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  smallDateDay: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 1 },
  myEventCopy: { flex: 1, minWidth: 0 },
  myEventTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  myEventDate: { color: colors.muted, fontSize: 9, marginTop: 5 },
  myEventCount: { color: colors.dim, fontSize: 9, marginTop: 4 },
  moreButton: { width: 26, height: 30, alignItems: 'center', justifyContent: 'center' },
  myEventMenu: { position: 'absolute', zIndex: 15, right: 4, top: 46, padding: 5, backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  myEventsEmpty: { minHeight: 58, justifyContent: 'flex-start', alignItems: 'center', flexDirection: 'row', gap: 10, borderRadius: 13, borderWidth: 1, borderColor: '#29323D', backgroundColor: '#10151C', paddingHorizontal: 14, paddingVertical: 12 },
  myEventsEmptyText: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  emptyState: { width: '100%', maxWidth: '100%', minWidth: 0, alignSelf: 'stretch', minHeight: 176, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 24, borderRadius: 18, borderWidth: 1, borderColor: '#2A3440', backgroundColor: '#11161D' },
  emptyStateIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: eventColors.accentSoft, borderWidth: 1, borderColor: eventColors.line, alignItems: 'center', justifyContent: 'center' },
  emptyStateTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyStateBody: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: 5, maxWidth: 300 },
  emptyStateAction: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: eventColors.accent, paddingHorizontal: 13, marginTop: 16 },
  emptyStateActionText: { color: '#0B1016', fontWeight: '900', fontSize: 11 },
  actionsMenuBackdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.58)' },
  actionsMenuScrim: { ...StyleSheet.absoluteFill },
  actionsMenuSheet: { width: '100%', maxWidth: 520, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, backgroundColor: '#11161D', borderTopLeftRadius: 23, borderTopRightRadius: 23, borderWidth: 1, borderColor: '#303A46' },
  actionsMenuHandle: { width: 38, height: 4, borderRadius: 4, backgroundColor: '#596574', alignSelf: 'center', marginBottom: 12 },
  actionsMenuHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  actionsMenuTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  actionsMenuItem: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(215,222,230,0.08)' },
  actionsMenuItemLast: { borderBottomWidth: 0 },
  actionsMenuIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(215,222,230,0.08)', alignItems: 'center', justifyContent: 'center' },
  actionsMenuCopy: { flex: 1, minWidth: 0 },
  actionsMenuItemTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  actionsMenuItemMeta: { color: colors.dim, fontSize: 10, marginTop: 3 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 580, maxHeight: '91%', backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  createModal: { maxWidth: 600 },
  createModalWide: { maxWidth: 650 },
  peopleModal: { maxWidth: 510, minHeight: 310, paddingBottom: 14 },
  confirmModal: { maxWidth: 420, padding: 23, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 15, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalHeaderCopy: { flex: 1, minWidth: 0 },
  modalEyebrow: { color: eventColors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7 },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  modalSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  modalClose: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  formContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 23 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 7 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800' },
  fieldHint: { color: colors.dim, fontSize: 9 },
  input: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12, color: colors.text, fontSize: 12 },
  coverPicker: { height: 156, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: eventColors.line, backgroundColor: colors.surfaceRaised, overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  coverPreview: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 5 },
  coverPlaceholderText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  coverPlaceholderHint: { color: colors.dim, fontSize: 9 },
  coverPickerBadge: { position: 'absolute', right: 10, bottom: 10, minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: eventColors.accent, paddingHorizontal: 10 },
  coverPickerBadgeText: { color: '#0B1016', fontSize: 9, fontWeight: '900' },
  removeCoverButton: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 3 },
  removeCoverText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  multilineInput: { minHeight: 84, paddingTop: 11, paddingBottom: 11 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  formCategory: { minHeight: 35, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  formCategoryActive: { borderColor: eventColors.line, backgroundColor: eventColors.accentSoft },
  formCategoryText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  formCategoryTextActive: { color: eventColors.accent },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1.25, minWidth: 0 },
  timeField: { flex: 0.8, minWidth: 0 },
  inputMiniLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  inputIconWrap: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  dateTimeInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, paddingVertical: 9, outlineStyle: 'none' as never },
  timeHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  timeHintText: { color: colors.dim, fontSize: 9, lineHeight: 14, flex: 1 },
  formInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginTop: 18, borderRadius: 11, backgroundColor: eventColors.accentSoft, borderWidth: 1, borderColor: eventColors.line },
  formInfoText: { color: colors.muted, fontSize: 10, lineHeight: 15, flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 20 },
  cancelButton: { minHeight: 39, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  submitButton: { minHeight: 39, paddingHorizontal: 16, borderRadius: 10, backgroundColor: eventColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  submitButtonText: { color: '#0B1016', fontSize: 11, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  peopleList: { flexGrow: 0, maxHeight: 390, paddingHorizontal: 17 },
  peopleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 9 },
  peopleCopy: { flex: 1, minWidth: 0 },
  peopleName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  peopleUsername: { color: colors.dim, fontSize: 10, marginTop: 4 },
  selectionBox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1, borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  selectionBoxSelected: { backgroundColor: eventColors.accent, borderColor: eventColors.accent },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 13, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  modalFootnote: { color: colors.dim, fontSize: 10, flex: 1 },
  modalSectionLabel: { color: colors.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 5 },
  addBlockButton: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: eventColors.accent, paddingHorizontal: 13, marginHorizontal: 20, marginTop: 15 },
  addBlockButtonText: { color: '#0B1016', fontSize: 10, fontWeight: '900' },
  unblockButton: { minHeight: 31, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  unblockText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  readOnlyTag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: colors.surfaceRaised },
  readOnlyTagText: { color: colors.dim, fontSize: 9, fontWeight: '800' },
  searchPeopleRow: { minHeight: 43, marginHorizontal: 19, marginTop: 17, marginBottom: 8, paddingLeft: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchAction: { width: 35, height: 35, marginRight: 4, borderRadius: 9, backgroundColor: eventColors.accent, alignItems: 'center', justifyContent: 'center' },
  blockAction: { minHeight: 32, paddingHorizontal: 11, borderRadius: 9, backgroundColor: eventColors.accent, alignItems: 'center', justifyContent: 'center' },
  blockActionDisabled: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  blockActionText: { color: '#0B1016', fontSize: 10, fontWeight: '900' },
  blockActionTextDisabled: { color: colors.dim },
  noSearchResults: { color: colors.dim, fontSize: 11, lineHeight: 17, padding: 20, textAlign: 'center' },
  confirmIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: 'rgba(224,140,140,0.10)', borderWidth: 1, borderColor: 'rgba(224,140,140,0.24)', alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 15 },
  confirmBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  deleteConfirmButton: { minHeight: 39, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#B65353', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteConfirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
