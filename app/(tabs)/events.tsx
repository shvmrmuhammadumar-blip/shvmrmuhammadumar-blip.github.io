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
import { pickImage, uploadImage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import type { Database } from '../../lib/database.types';

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

const EVENT_ACCENT = '#E9A24D';
const EVENT_ACCENT_SOFT = 'rgba(233, 162, 77, 0.13)';
const EVENT_LINE = 'rgba(233, 162, 77, 0.28)';

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
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { width } = useWindowDimensions();
  const desktop = width >= 1180;
  const tablet = width >= 760;

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
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.pageInner, !desktop && styles.pageInnerNarrow]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.eyebrow}>LUMO / COMMUNITY</Text>
              </View>
              <Text style={styles.pageTitle}>Events</Text>
              <Text style={styles.subtitle}>Meet your people. Discover what’s happening. Together is better.</Text>
            </View>
            <Pressable onPress={() => openCreate()} style={styles.createButton}>
              <Ionicons name="add" color="#17130E" size={20} />
              <Text style={styles.createButtonText}>Create event</Text>
            </Pressable>
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={17} color="#F1A0A0" />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <Pressable onPress={() => setErrorMessage(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.columns, !desktop && styles.columnsStacked]}>
            <View style={styles.mainColumn}>
              <View style={[styles.toolbar, !tablet && styles.toolbarStacked]}>
                <View style={styles.segmented}>
                  <Pressable
                    onPress={() => setActiveTab('all')}
                    style={[styles.segment, activeTab === 'all' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, activeTab === 'all' && styles.segmentTextActive]}>All</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setActiveTab('personal')}
                    style={[styles.segment, activeTab === 'personal' && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, activeTab === 'personal' && styles.segmentTextActive]}>Personal</Text>
                    {personalIds.length > 0 ? (
                      <View style={styles.segmentCount}><Text style={styles.segmentCountText}>{personalIds.length}</Text></View>
                    ) : null}
                  </Pressable>
                </View>

                <View style={styles.toolbarActions}>
                  <Pressable onPress={() => setPersonalVisible(true)} style={styles.followingButton}>
                    <Ionicons name="people-outline" size={17} color={colors.text} />
                    <Text style={styles.followingButtonText}>Following</Text>
                    <Ionicons name="chevron-down" size={15} color={colors.muted} />
                  </Pressable>
                  <Pressable onPress={() => setBlocksVisible(true)} style={styles.manageBlocksButton}>
                    <Ionicons name="shield-checkmark-outline" size={16} color={EVENT_ACCENT} />
                    <Text style={styles.manageBlocksText}>Manage blocks</Text>
                    {blockedIds.length ? <Text style={styles.blockCount}>{blockedIds.length}</Text> : null}
                  </Pressable>
                </View>
              </View>

              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={18} color={colors.dim} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Search events, places or people"
                  placeholderTextColor={colors.dim}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
                {searchText ? (
                  <Pressable onPress={() => setSearchText('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={17} color={colors.dim} />
                  </Pressable>
                ) : null}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
                <Pressable
                  onPress={() => setActiveCategory('all')}
                  style={[styles.categoryChip, activeCategory === 'all' && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryChipText, activeCategory === 'all' && styles.categoryChipTextActive]}>All events</Text>
                </Pressable>
                {categoryOptions.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setActiveCategory((current) => current === item.key ? 'all' : item.key)}
                    style={[styles.categoryChip, activeCategory === item.key && styles.categoryChipActive]}
                  >
                    <Ionicons name={item.icon} size={14} color={activeCategory === item.key ? EVENT_ACCENT : colors.muted} />
                    <Text style={[styles.categoryChipText, activeCategory === item.key && styles.categoryChipTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {loading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={EVENT_ACCENT} size="large" />
                  <Text style={styles.loadingText}>Finding your next event…</Text>
                </View>
              ) : !userId ? (
                <EmptyState icon="calendar-outline" title="Sign in to explore events" body="Follow people and find out what they are planning." />
              ) : activeEvents.length === 0 ? (
                <EmptyState
                  icon={activeTab === 'personal' ? 'options-outline' : 'calendar-outline'}
                  title={activeTab === 'personal' ? 'Your Personal list is quiet' : 'No upcoming events'}
                  body={
                    activeTab === 'personal'
                      ? 'Choose people you follow to build a focused event feed.'
                      : 'When people you follow create events, they will appear here.'
                  }
                  actionLabel={activeTab === 'personal' ? 'Choose people' : 'Create an event'}
                  onAction={activeTab === 'personal' ? () => setPersonalVisible(true) : () => openCreate()}
                />
              ) : (
                <>
                  {featuredEvent ? (
                    <View style={[styles.featuredCard, !tablet && styles.featuredCardStacked]}>
                      <View style={[styles.featuredImageWrap, !tablet && styles.featuredImageWrapStacked]}>
                        {featuredEvent.cover_url ? (
                          <Image source={{ uri: featuredEvent.cover_url }} style={[styles.featuredImage, !tablet && styles.featuredImageStacked]} contentFit="cover" />
                        ) : (
                          <View style={[styles.featuredImage, styles.featuredImageFallback, !tablet && styles.featuredImageStacked]}>
                            <Ionicons name={categoryOptions.find((item) => item.key === featuredEvent.category)?.icon ?? 'calendar-outline'} size={54} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.fallbackWord}>{categoryNames[featuredEvent.category] ?? 'EVENT'}</Text>
                          </View>
                        )}
                        <View style={styles.imageShade} />
                        <View style={styles.featuredLabel}><Text style={styles.featuredLabelText}>UP NEXT</Text></View>
                      </View>
                      <View style={styles.featuredContent}>
                        <View style={styles.featuredTopline}>
                          <Text style={styles.categoryKicker}>{categoryNames[featuredEvent.category] ?? 'EVENT'}</Text>
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
                        <Text style={styles.featuredTitle}>{featuredEvent.title}</Text>
                        {featuredEvent.description ? (
                          <Text style={styles.featuredDescription} numberOfLines={3}>{featuredEvent.description}</Text>
                        ) : null}
                        <HostLine profile={featuredEvent.host} />
                        <View style={styles.eventMetaGrid}>
                          <MetaLine icon="calendar-outline" primary={eventDate(featuredEvent.starts_at)} secondary={eventTime(featuredEvent.starts_at)} />
                          <MetaLine
                            icon={featuredEvent.meeting_url ? 'videocam-outline' : 'location-outline'}
                            primary={featuredEvent.meeting_url ? 'Online event' : featuredEvent.location || 'Location not set'}
                            secondary={featuredEvent.meeting_url ? 'Meeting link available' : ''}
                          />
                          <MetaLine icon="people-outline" primary={String(featuredEvent.goingCount)} secondary="going" />
                        </View>
                        <View style={styles.featuredActions}>
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
                            <Pressable onPress={() => openMeeting(featuredEvent.meeting_url!)} style={styles.meetingButton}>
                              <Ionicons name="open-outline" size={16} color={colors.text} />
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.listHeading}>
                    <View>
                      <Text style={styles.sectionTitle}>Upcoming events</Text>
                      <Text style={styles.sectionSubline}>{activeEvents.length} event{activeEvents.length === 1 ? '' : 's'} from your circle</Text>
                    </View>
                    <Text style={styles.headingHint}>SORTED BY DATE</Text>
                  </View>

                  <View style={styles.eventList}>
                    {(featuredEvent ? upcomingEvents : activeEvents).map((event) => (
                      <EventListItem
                        key={event.id}
                        event={event}
                        userId={userId}
                        compact={width < 520}
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

            <View style={[styles.sideColumn, !desktop && styles.sideColumnNarrow]}>
              <View style={styles.sideHeading}>
                <View>
                  <Text style={styles.sideTitle}>My events</Text>
                  <Text style={styles.sideSubtitle}>Events you’re hosting</Text>
                </View>
                <Pressable onPress={() => openCreate()} style={styles.iconButton} accessibilityLabel="Create event">
                  <Ionicons name="add" size={20} color={EVENT_ACCENT} />
                </Pressable>
              </View>

              {visibleMyEvents.length ? (
                <View style={styles.myEventList}>
                  {visibleMyEvents.map((event) => (
                    <View key={event.id} style={styles.myEventRow}>
                      <View style={styles.smallDateBlock}>
                        <Text style={styles.smallDateMonth}>{monthShort(event.starts_at)}</Text>
                        <Text style={styles.smallDateDay}>{dayNumber(event.starts_at)}</Text>
                      </View>
                      <View style={styles.myEventCopy}>
                        <Text numberOfLines={1} style={styles.myEventTitle}>{event.title}</Text>
                        <Text style={styles.myEventDate}>{eventDate(event.starts_at)} · {eventTime(event.starts_at)}</Text>
                        <Text style={styles.myEventCount}>{event.goingCount} going · {event.interestedCount} interested</Text>
                      </View>
                      <Pressable onPress={() => setMenuEventId(menuEventId === event.id ? null : event.id)} style={styles.moreButton}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                      </Pressable>
                      {menuEventId === event.id ? (
                        <View style={styles.myEventMenu}>
                          <Pressable onPress={() => openCreate(event)} style={styles.menuItem}>
                            <Ionicons name="create-outline" size={16} color={colors.text} />
                            <Text style={styles.menuItemText}>Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => setDeleteTarget(event)} style={styles.menuItem}>
                            <Ionicons name="trash-outline" size={16} color="#E08C8C" />
                            <Text style={[styles.menuItemText, { color: '#E08C8C' }]}>Delete</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.myEventsEmpty}>
                  <View style={styles.emptyCalendarIcon}>
                    <Ionicons name="calendar-outline" size={29} color={EVENT_ACCENT} />
                    <View style={styles.emptyPlus}><Ionicons name="add" size={14} color="#17130E" /></View>
                  </View>
                  <Text style={styles.emptyTitle}>No events yet</Text>
                  <Text style={styles.emptyBody}>When you create an event, it will show up here so you can manage it and see who’s coming.</Text>
                  <Pressable onPress={() => openCreate()} style={styles.emptyCreateButton}>
                    <Ionicons name="add" size={16} color="#17130E" />
                    <Text style={styles.emptyCreateText}>Create event</Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.sideNote}>
                <View style={styles.sideNoteIcon}><Ionicons name="hourglass-outline" size={17} color={EVENT_ACCENT} /></View>
                <View style={styles.sideNoteCopy}>
                  <Text style={styles.sideNoteTitle}>One hour after it starts</Text>
                  <Text style={styles.sideNoteText}>Events disappear automatically. You can remove your own event any time.</Text>
                </View>
              </View>

              <Pressable onPress={() => setBlocksVisible(true)} style={styles.sideBlockLink}>
                <Ionicons name="shield-checkmark-outline" size={17} color={colors.muted} />
                <Text style={styles.sideBlockText}>Event visibility & blocks</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.dim} />
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={createVisible} transparent animationType="fade" onRequestClose={() => setCreateVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.createModal, tablet && styles.createModalWide]}>
            <ModalHeader
              eyebrow={editingEvent ? 'YOUR EVENT' : 'BRING PEOPLE TOGETHER'}
              title={editingEvent ? 'Edit event' : 'Create an event'}
              subtitle="Set the details. Your event will be visible to people who follow you."
              onClose={() => setCreateVisible(false)}
            />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
              <FieldLabel label="Event name" hint="Required" />
              <TextInput
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="What are you planning?"
                placeholderTextColor={colors.dim}
                style={styles.input}
                maxLength={120}
              />

              <FieldLabel label="Category" />
              <View style={styles.categoryGrid}>
                {categoryOptions.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setFormCategory(item.key)}
                    style={[styles.formCategory, formCategory === item.key && styles.formCategoryActive]}
                  >
                    <Ionicons name={item.icon} size={16} color={formCategory === item.key ? EVENT_ACCENT : colors.muted} />
                    <Text style={[styles.formCategoryText, formCategory === item.key && styles.formCategoryTextActive]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <FieldLabel label="Description" hint="Optional" />
              <TextInput
                value={formDescription}
                onChangeText={setFormDescription}
                placeholder="Give people a little context…"
                placeholderTextColor={colors.dim}
                style={[styles.input, styles.multilineInput]}
                multiline
                maxLength={1200}
                textAlignVertical="top"
              />

              <FieldLabel label="When does it start?" hint="Your local time" />
              <View style={styles.dateTimeRow}>
                <View style={styles.dateField}>
                  <Text style={styles.inputMiniLabel}>DATE</Text>
                  <View style={styles.inputIconWrap}>
                    <Ionicons name="calendar-outline" size={16} color={EVENT_ACCENT} />
                    <TextInput
                      value={formDate}
                      onChangeText={setFormDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.dim}
                      style={styles.dateTimeInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={10}
                    />
                  </View>
                </View>
                <View style={styles.timeField}>
                  <Text style={styles.inputMiniLabel}>TIME</Text>
                  <View style={styles.inputIconWrap}>
                    <Ionicons name="time-outline" size={16} color={EVENT_ACCENT} />
                    <TextInput
                      value={formTime}
                      onChangeText={setFormTime}
                      placeholder="18:30"
                      placeholderTextColor={colors.dim}
                      style={styles.dateTimeInput}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
              </View>
              <View style={styles.timeHint}><Ionicons name="information-circle-outline" size={14} color={colors.dim} /><Text style={styles.timeHintText}>Example: 2026-11-19 · 18:30. Event automatically expires one hour after this time.</Text></View>

              <FieldLabel label="Location" hint="Optional" />
              <TextInput value={formLocation} onChangeText={setFormLocation} placeholder="Venue, address or meeting point" placeholderTextColor={colors.dim} style={styles.input} maxLength={180} />

              <FieldLabel label="Online meeting link" hint="Optional" />
              <TextInput value={formMeetingUrl} onChangeText={setFormMeetingUrl} placeholder="https://…" placeholderTextColor={colors.dim} style={styles.input} autoCapitalize="none" keyboardType="url" />

              <FieldLabel label="Event cover" hint="Optional · 16:9" />
              <Pressable onPress={() => void chooseCover()} style={styles.coverPicker}>
                {coverUri || formCoverUrl ? (
                  <Image source={{ uri: coverUri || formCoverUrl }} style={styles.coverPreview} contentFit="cover" />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Ionicons name="image-outline" size={27} color={EVENT_ACCENT} />
                    <Text style={styles.coverPlaceholderText}>Choose a cover image</Text>
                    <Text style={styles.coverPlaceholderHint}>Select a photo from your gallery</Text>
                  </View>
                )}
                <View style={styles.coverPickerBadge}>
                  <Ionicons name="images-outline" size={15} color="#17130E" />
                  <Text style={styles.coverPickerBadgeText}>{coverUri || formCoverUrl ? 'Change cover' : 'Choose image'}</Text>
                </View>
              </Pressable>
              <TextInput
                value={formCoverUrl}
                onChangeText={(value) => { setFormCoverUrl(value); setCoverUri(null); }}
                placeholder="Or paste an image URL"
                placeholderTextColor={colors.dim}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
              />
              {coverUri || formCoverUrl ? (
                <Pressable onPress={() => { setCoverUri(null); setFormCoverUrl(''); }} style={styles.removeCoverButton}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.muted} />
                  <Text style={styles.removeCoverText}>Remove cover</Text>
                </Pressable>
              ) : null}

              <View style={styles.formInfo}>
                <Ionicons name="eye-outline" size={17} color={EVENT_ACCENT} />
                <Text style={styles.formInfoText}>Your event appears in followers’ All feed. People who select you in Personal will see it there too.</Text>
              </View>
              <View style={styles.modalActions}>
                <Pressable onPress={() => setCreateVisible(false)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
                <Pressable onPress={() => void saveEvent()} disabled={saving} style={[styles.submitButton, saving && styles.disabledButton]}>
                  {saving ? <ActivityIndicator color="#17130E" size="small" /> : <Ionicons name="checkmark" size={18} color="#17130E" />}
                  <Text style={styles.submitButtonText}>{editingEvent ? 'Save changes' : 'Publish event'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={personalVisible} transparent animationType="fade" onRequestClose={() => setPersonalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.peopleModal]}>
            <ModalHeader eyebrow="YOUR CIRCLE" title="Personal feed" subtitle="Choose people you follow. Only their events will appear in Personal." onClose={() => setPersonalVisible(false)} />
            {followings.length ? (
              <ScrollView style={styles.peopleList} showsVerticalScrollIndicator={false}>
                {followings.map((profile) => {
                  const selected = personalIds.includes(profile.id);
                  return (
                    <Pressable key={profile.id} onPress={() => void togglePersonal(profile.id)} style={styles.peopleRow}>
                      <Avatar uri={profile.avatar_url} name={displayName(profile)} size={42} />
                      <View style={styles.peopleCopy}>
                        <Text style={styles.peopleName}>{displayName(profile)}</Text>
                        <Text style={styles.peopleUsername}>@{profile.username}</Text>
                      </View>
                      <View style={[styles.selectionBox, selected && styles.selectionBoxSelected]}>
                        {selected ? <Ionicons name="checkmark" size={15} color="#17130E" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState icon="people-outline" title="No followings yet" body="Follow people first. You can then add them to your Personal event feed." />
            )}
            <View style={styles.modalFooter}>
              <Text style={styles.modalFootnote}>{personalIds.length} people selected</Text>
              <Pressable onPress={() => setPersonalVisible(false)} style={styles.submitButton}><Text style={styles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={blocksVisible} transparent animationType="fade" onRequestClose={() => setBlocksVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.peopleModal]}>
            <ModalHeader eyebrow="EVENT PRIVACY" title="Manage event blocks" subtitle="Blocked accounts cannot see your events, and you cannot see theirs. This does not block their profile." onClose={() => setBlocksVisible(false)} />
            <Pressable onPress={() => { setBlocksVisible(false); setSearchPeopleVisible(true); }} style={styles.addBlockButton}>
              <Ionicons name="person-add-outline" size={17} color="#17130E" />
              <Text style={styles.addBlockButtonText}>Block someone in Events</Text>
            </Pressable>
            <Text style={styles.modalSectionLabel}>EVENT VISIBILITY</Text>
            {blockedIds.length ? (
              <ScrollView style={styles.peopleList} showsVerticalScrollIndicator={false}>
                {blockedIds.map((id) => {
                  const profile = blockProfiles.find((item) => item.id === id);
                  const blockedByMe = blockRows.some((row) => row.blocker_id === userId && row.blocked_id === id);
                  return (
                    <View key={id} style={styles.peopleRow}>
                      <Avatar uri={profile?.avatar_url} name={displayName(profile)} size={42} />
                      <View style={styles.peopleCopy}>
                        <Text style={styles.peopleName}>{displayName(profile)}</Text>
                        <Text style={styles.peopleUsername}>{blockedByMe ? 'You blocked their events' : 'They blocked event visibility'}</Text>
                      </View>
                      {blockedByMe ? (
                        <Pressable onPress={() => void unblockProfile(id)} style={styles.unblockButton}><Text style={styles.unblockText}>Unblock</Text></Pressable>
                      ) : (
                        <View style={styles.readOnlyTag}><Text style={styles.readOnlyTagText}>Restricted</Text></View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <EmptyState icon="shield-checkmark-outline" title="No event blocks" body="People you block here will only be hidden from your Events experience." />
            )}
            <View style={styles.modalFooter}>
              <Text style={styles.modalFootnote}>{blockedIds.length} account{blockedIds.length === 1 ? '' : 's'}</Text>
              <Pressable onPress={() => setBlocksVisible(false)} style={styles.submitButton}><Text style={styles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={searchPeopleVisible} transparent animationType="fade" onRequestClose={() => setSearchPeopleVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.peopleModal]}>
            <ModalHeader eyebrow="EVENT PRIVACY" title="Block an account" subtitle="Search any LUMO user. This only affects events." onClose={() => setSearchPeopleVisible(false)} />
            <View style={styles.searchPeopleRow}>
              <Ionicons name="search-outline" size={18} color={colors.dim} />
              <TextInput
                value={profileSearch}
                onChangeText={setProfileSearch}
                placeholder="Search username or name"
                placeholderTextColor={colors.dim}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={() => void searchProfiles()}
              />
              <Pressable onPress={() => void searchProfiles()} style={styles.searchAction}>
                {searchingProfiles ? <ActivityIndicator size="small" color="#17130E" /> : <Ionicons name="arrow-forward" size={17} color="#17130E" />}
              </Pressable>
            </View>
            <ScrollView style={styles.peopleList} keyboardShouldPersistTaps="handled">
              {profileResults.map((profile) => {
                const alreadyBlocked = blockRows.some((row) =>
                  (row.blocker_id === userId && row.blocked_id === profile.id) ||
                  (row.blocker_id === profile.id && row.blocked_id === userId),
                );
                return (
                  <View key={profile.id} style={styles.peopleRow}>
                    <Avatar uri={profile.avatar_url} name={displayName(profile)} size={42} />
                    <View style={styles.peopleCopy}>
                      <Text style={styles.peopleName}>{displayName(profile)}</Text>
                      <Text style={styles.peopleUsername}>@{profile.username}</Text>
                    </View>
                    <Pressable
                      disabled={alreadyBlocked || saving}
                      onPress={() => void blockProfile(profile)}
                      style={[styles.blockAction, alreadyBlocked && styles.blockActionDisabled]}
                    >
                      <Text style={[styles.blockActionText, alreadyBlocked && styles.blockActionTextDisabled]}>{alreadyBlocked ? 'Blocked' : 'Block'}</Text>
                    </Pressable>
                  </View>
                );
              })}
              {!profileResults.length && profileSearch.trim() ? (
                <Text style={styles.noSearchResults}>Search for a LUMO username or full name.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Text style={styles.modalFootnote}>Event-only. Profiles and chats stay unchanged.</Text>
              <Pressable onPress={() => setSearchPeopleVisible(false)} style={styles.submitButton}><Text style={styles.submitButtonText}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(deleteTarget)} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.confirmModal]}>
            <View style={styles.confirmIcon}><Ionicons name="trash-outline" size={25} color="#E08C8C" /></View>
            <Text style={styles.confirmTitle}>Delete this event?</Text>
            <Text style={styles.confirmBody}>“{deleteTarget?.title}” will be removed for everyone. This cannot be undone.</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setDeleteTarget(null)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Keep event</Text></Pressable>
              <Pressable onPress={() => void deleteEvent()} disabled={saving} style={styles.deleteConfirmButton}>
                {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="trash-outline" size={17} color="#FFFFFF" />}
                <Text style={styles.deleteConfirmText}>Delete event</Text>
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
  const mine = event.host_id === userId;
  return (
    <View style={styles.eventMenuWrap}>
      <Pressable onPress={onToggle} style={styles.eventMenuButton}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.eventMenuPopover}>
          {mine ? (
            <>
              <Pressable onPress={onEdit} style={styles.menuItem}><Ionicons name="create-outline" size={16} color={colors.text} /><Text style={styles.menuItemText}>Edit event</Text></Pressable>
              <Pressable onPress={onDelete} style={styles.menuItem}><Ionicons name="trash-outline" size={16} color="#E08C8C" /><Text style={[styles.menuItemText, { color: '#E08C8C' }]}>Delete event</Text></Pressable>
            </>
          ) : (
            <Pressable onPress={onBlock} style={styles.menuItem}><Ionicons name="shield-outline" size={16} color="#E08C8C" /><Text style={[styles.menuItemText, { color: '#E08C8C' }]}>Block events</Text></Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function HostLine({ profile }: { profile: ProfileRecord | null }) {
  return (
    <View style={styles.hostLine}>
      <Avatar uri={profile?.avatar_url} name={displayName(profile)} size={27} />
      <View style={styles.hostCopy}>
        <Text style={styles.hostName}>{displayName(profile)}</Text>
        {profile?.username ? <Text style={styles.hostUsername}>@{profile.username}</Text> : null}
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
  return (
    <View style={styles.metaLine}>
      <Ionicons name={icon} size={17} color={EVENT_ACCENT} />
      <View style={styles.metaCopy}>
        <Text numberOfLines={1} style={styles.metaPrimary}>{primary}</Text>
        {secondary ? <Text numberOfLines={1} style={styles.metaSecondary}>{secondary}</Text> : null}
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
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[
        styles.rsvpButton,
        outline && styles.rsvpButtonOutline,
        selected && styles.rsvpButtonSelected,
        busy && styles.disabledButton,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={selected || !outline ? '#17130E' : colors.text} /> : <Ionicons name={selected ? 'checkmark' : icon} size={16} color={selected || !outline ? '#17130E' : colors.text} />}
      <Text style={[styles.rsvpText, outline && !selected && styles.rsvpTextOutline]}>{selected ? (label === 'Going' ? 'Going' : 'Interested') : label}</Text>
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
  return (
    <View style={[styles.eventListItem, compact && styles.eventListItemCompact]}>
      <View style={[styles.dateBlock, compact && styles.dateBlockCompact]}>
        <Text style={styles.dateMonth}>{monthShort(event.starts_at)}</Text>
        <Text style={styles.dateDay}>{dayNumber(event.starts_at)}</Text>
        <Text style={styles.dateWeekday}>{new Date(event.starts_at).toLocaleDateString(undefined, { weekday: 'short' })}</Text>
      </View>
      {event.cover_url ? (
        <Image source={{ uri: event.cover_url }} style={[styles.listThumb, compact && styles.listThumbCompact]} contentFit="cover" />
      ) : (
        <View style={[styles.listThumb, styles.listThumbFallback, compact && styles.listThumbCompact]}>
          <Ionicons name={categoryOptions.find((item) => item.key === event.category)?.icon ?? 'calendar-outline'} size={25} color={EVENT_ACCENT} />
        </View>
      )}
      <View style={styles.listEventContent}>
        <View style={styles.listTitleRow}>
          <Text numberOfLines={1} style={styles.listEventTitle}>{event.title}</Text>
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
        <Text numberOfLines={1} style={styles.listDescription}>{event.description || categoryNames[event.category] || 'Community event'}</Text>
        <View style={styles.listMetaRow}>
          <Avatar uri={event.host?.avatar_url} name={displayName(event.host)} size={18} />
          <Text style={styles.listHostText}>{event.host?.username ? `@${event.host.username}` : displayName(event.host)}</Text>
          <Ionicons name="time-outline" size={13} color={colors.dim} />
          <Text style={styles.listMetaText}>{eventTime(event.starts_at)}</Text>
          <Ionicons name={event.meeting_url ? 'videocam-outline' : 'location-outline'} size={13} color={colors.dim} />
          <Text numberOfLines={1} style={styles.listMetaText}>{event.meeting_url ? 'Online' : event.location || 'Location TBA'}</Text>
        </View>
      </View>
      <View style={styles.listEventActions}>
        <Text style={styles.goingCount}><Ionicons name="people-outline" size={13} color={colors.muted} /> {event.goingCount}</Text>
        <Pressable
          onPress={() => onRsvp('going')}
          disabled={rsvpBusy}
          style={[styles.smallGoingButton, event.myStatus === 'going' && styles.smallGoingButtonActive]}
        >
          <Text style={[styles.smallGoingText, event.myStatus === 'going' && styles.smallGoingTextActive]}>{event.myStatus === 'going' ? 'Going' : 'Join'}</Text>
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
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateIcon}><Ionicons name={icon} size={29} color={EVENT_ACCENT} /></View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.emptyStateAction}>
          <Text style={styles.emptyStateActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color="#17130E" />
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
  return (
    <View style={styles.modalHeader}>
      <View style={styles.modalHeaderCopy}>
        <Text style={styles.modalEyebrow}>{eyebrow}</Text>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.modalSubtitle}>{subtitle}</Text>
      </View>
      <Pressable onPress={onClose} style={styles.modalClose} accessibilityLabel="Close">
        <Ionicons name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 44 },
  pageInner: { width: '100%', maxWidth: 1540, alignSelf: 'center', paddingHorizontal: 34, paddingTop: 34 },
  pageInnerNarrow: { paddingHorizontal: 20, paddingTop: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 22, marginBottom: 28 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  eyebrowDot: { width: 7, height: 7, borderRadius: 8, backgroundColor: EVENT_ACCENT },
  eyebrow: { color: EVENT_ACCENT, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  pageTitle: { color: '#F5F1E9', fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 5, lineHeight: 19 },
  createButton: { minHeight: 44, paddingHorizontal: 19, borderRadius: 14, backgroundColor: EVENT_ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  createButtonText: { color: '#17130E', fontWeight: '800', fontSize: 13 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(224,140,140,0.25)', backgroundColor: 'rgba(224,140,140,0.08)', borderRadius: 12, marginBottom: 16 },
  errorText: { color: '#E7B2B2', fontSize: 12, flex: 1, lineHeight: 17 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  columnsStacked: { flexDirection: 'column' },
  mainColumn: { flex: 1, minWidth: 0 },
  sideColumn: { width: 312, borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 25, paddingTop: 5 },
  sideColumnNarrow: { width: '100%', borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: colors.border, paddingLeft: 0, paddingTop: 22, marginTop: 18 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 15, marginBottom: 16 },
  toolbarStacked: { flexDirection: 'column', alignItems: 'stretch' },
  segmented: { height: 42, flexDirection: 'row', alignItems: 'center', padding: 3, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, alignSelf: 'flex-start' },
  segment: { minWidth: 96, height: 34, paddingHorizontal: 16, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  segmentActive: { backgroundColor: EVENT_ACCENT_SOFT, borderWidth: 1, borderColor: EVENT_LINE },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: EVENT_ACCENT },
  segmentCount: { backgroundColor: EVENT_ACCENT, minWidth: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentCountText: { color: '#17130E', fontSize: 9, fontWeight: '900' },
  toolbarActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  followingButton: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8 },
  followingButtonText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  manageBlocksButton: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 7 },
  manageBlocksText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  blockCount: { color: EVENT_ACCENT, fontSize: 11, fontWeight: '900' },
  searchRow: { height: 43, paddingHorizontal: 13, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 13, paddingVertical: 8, outlineStyle: 'none' as never },
  categoryRail: { gap: 7, paddingBottom: 17 },
  categoryChip: { minHeight: 32, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  categoryChipActive: { borderColor: EVENT_LINE, backgroundColor: EVENT_ACCENT_SOFT },
  categoryChipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  categoryChipTextActive: { color: EVENT_ACCENT },
  loadingState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 13, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  loadingText: { color: colors.muted, fontSize: 13 },
  featuredCard: { backgroundColor: colors.surface, borderRadius: 19, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', flexDirection: 'row', minHeight: 300, marginBottom: 27 },
  featuredCardStacked: { flexDirection: 'column', minHeight: 0 },
  featuredImageWrap: { width: '35%', minWidth: 200, position: 'relative', backgroundColor: colors.surfaceRaised },
  featuredImageWrapStacked: { width: '100%', minWidth: 0, height: 165 },
  featuredImage: { width: '100%', height: '100%', minHeight: 300 },
  featuredImageStacked: { height: 165, minHeight: 165 },
  featuredImageFallback: { alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#2B251C' },
  fallbackWord: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,12,10,0.12)' },
  featuredLabel: { position: 'absolute', top: 15, left: 15, backgroundColor: EVENT_ACCENT, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
  featuredLabelText: { color: '#17130E', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  featuredContent: { flex: 1, minWidth: 0, padding: 20, justifyContent: 'center' },
  featuredTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryKicker: { color: EVENT_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  featuredTitle: { color: '#F5F1E9', fontSize: 24, fontWeight: '800', letterSpacing: -0.7, lineHeight: 30, marginTop: 8 },
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
  rsvpButton: { minHeight: 38, borderRadius: 11, paddingHorizontal: 16, backgroundColor: EVENT_ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  rsvpButtonOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  rsvpButtonSelected: { backgroundColor: '#F4C27E', borderColor: '#F4C27E' },
  rsvpText: { color: '#17130E', fontSize: 11, fontWeight: '900' },
  rsvpTextOutline: { color: colors.text },
  meetingButton: { height: 38, width: 38, borderRadius: 11, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  listHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { color: '#F5F1E9', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionSubline: { color: colors.dim, fontSize: 11, marginTop: 4 },
  headingHint: { color: colors.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  eventList: { borderTopWidth: 1, borderTopColor: colors.border },
  eventListItem: { minHeight: 105, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  eventListItemCompact: { minHeight: 88, paddingVertical: 10, gap: 8 },
  dateBlock: { width: 52, alignItems: 'center', justifyContent: 'center' },
  dateBlockCompact: { width: 38 },
  dateMonth: { color: EVENT_ACCENT, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  dateDay: { color: '#F5F1E9', fontSize: 25, fontWeight: '800', lineHeight: 29, marginTop: 1 },
  dateWeekday: { color: colors.dim, fontSize: 9, marginTop: 1 },
  listThumb: { width: 78, height: 76, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  listThumbCompact: { width: 56, height: 56 },
  listThumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2B251C' },
  listEventContent: { flex: 1, minWidth: 0 },
  listTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listEventTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '800' },
  listDescription: { color: colors.muted, fontSize: 10, marginTop: 4 },
  listMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  listHostText: { color: colors.muted, fontSize: 9, marginRight: 6 },
  listMetaText: { color: colors.dim, fontSize: 9, maxWidth: 120 },
  listEventActions: { alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  goingCount: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  smallGoingButton: { borderRadius: 9, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  smallGoingButtonActive: { borderColor: EVENT_LINE, backgroundColor: EVENT_ACCENT_SOFT },
  smallGoingText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  smallGoingTextActive: { color: EVENT_ACCENT },
  eventMenuWrap: { position: 'relative', zIndex: 4 },
  eventMenuButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  eventMenuPopover: { position: 'absolute', zIndex: 15, right: 0, top: 32, minWidth: 145, padding: 5, backgroundColor: colors.surfaceRaised, borderRadius: 11, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, elevation: 8 },
  menuItem: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, borderRadius: 8 },
  menuItemText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  sideHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 },
  sideTitle: { color: '#F5F1E9', fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  sideSubtitle: { color: colors.dim, fontSize: 11, marginTop: 4 },
  iconButton: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, borderColor: EVENT_LINE, backgroundColor: EVENT_ACCENT_SOFT, alignItems: 'center', justifyContent: 'center' },
  myEventList: { gap: 2 },
  myEventRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, position: 'relative' },
  smallDateBlock: { width: 38, alignItems: 'center' },
  smallDateMonth: { color: EVENT_ACCENT, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  smallDateDay: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 1 },
  myEventCopy: { flex: 1, minWidth: 0 },
  myEventTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  myEventDate: { color: colors.muted, fontSize: 9, marginTop: 5 },
  myEventCount: { color: colors.dim, fontSize: 9, marginTop: 4 },
  moreButton: { width: 26, height: 30, alignItems: 'center', justifyContent: 'center' },
  myEventMenu: { position: 'absolute', zIndex: 15, right: 4, top: 46, padding: 5, backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  myEventsEmpty: { minHeight: 260, justifyContent: 'center', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 18, paddingVertical: 22 },
  emptyCalendarIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: EVENT_ACCENT_SOFT, borderWidth: 1, borderColor: EVENT_LINE, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  emptyPlus: { position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: EVENT_ACCENT, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 18 },
  emptyBody: { color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 7 },
  emptyCreateButton: { minHeight: 36, borderRadius: 10, paddingHorizontal: 13, backgroundColor: EVENT_ACCENT, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  emptyCreateText: { color: '#17130E', fontSize: 11, fontWeight: '900' },
  sideNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 19, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: EVENT_LINE, backgroundColor: EVENT_ACCENT_SOFT },
  sideNoteIcon: { width: 29, height: 29, borderRadius: 9, backgroundColor: 'rgba(233,162,77,0.12)', alignItems: 'center', justifyContent: 'center' },
  sideNoteCopy: { flex: 1 },
  sideNoteTitle: { color: colors.text, fontSize: 11, fontWeight: '800' },
  sideNoteText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  sideBlockLink: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 10 },
  sideBlockText: { color: colors.muted, fontSize: 11, fontWeight: '700', flex: 1 },
  emptyState: { minHeight: 285, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 35, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  emptyStateIcon: { width: 60, height: 60, borderRadius: 19, backgroundColor: EVENT_ACCENT_SOFT, borderWidth: 1, borderColor: EVENT_LINE, alignItems: 'center', justifyContent: 'center' },
  emptyStateTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 16 },
  emptyStateBody: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 7, maxWidth: 330 },
  emptyStateAction: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: EVENT_ACCENT, paddingHorizontal: 13, marginTop: 16 },
  emptyStateActionText: { color: '#17130E', fontWeight: '900', fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 580, maxHeight: '91%', backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  createModal: { maxWidth: 600 },
  createModalWide: { maxWidth: 650 },
  peopleModal: { maxWidth: 510, minHeight: 310, paddingBottom: 14 },
  confirmModal: { maxWidth: 420, padding: 23, alignItems: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 15, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 17, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalHeaderCopy: { flex: 1, minWidth: 0 },
  modalEyebrow: { color: EVENT_ACCENT, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7 },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  modalSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
  modalClose: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  formContent: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 23 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15, marginBottom: 7 },
  fieldLabel: { color: colors.text, fontSize: 11, fontWeight: '800' },
  fieldHint: { color: colors.dim, fontSize: 9 },
  input: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 12, color: colors.text, fontSize: 12 },
  coverPicker: { height: 156, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: EVENT_LINE, backgroundColor: colors.surfaceRaised, overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  coverPreview: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 5 },
  coverPlaceholderText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  coverPlaceholderHint: { color: colors.dim, fontSize: 9 },
  coverPickerBadge: { position: 'absolute', right: 10, bottom: 10, minHeight: 29, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: EVENT_ACCENT, paddingHorizontal: 10 },
  coverPickerBadgeText: { color: '#17130E', fontSize: 9, fontWeight: '900' },
  removeCoverButton: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingVertical: 3 },
  removeCoverText: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  multilineInput: { minHeight: 84, paddingTop: 11, paddingBottom: 11 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  formCategory: { minHeight: 35, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  formCategoryActive: { borderColor: EVENT_LINE, backgroundColor: EVENT_ACCENT_SOFT },
  formCategoryText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  formCategoryTextActive: { color: EVENT_ACCENT },
  dateTimeRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1.25, minWidth: 0 },
  timeField: { flex: 0.8, minWidth: 0 },
  inputMiniLabel: { color: colors.dim, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  inputIconWrap: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  dateTimeInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 12, paddingVertical: 9, outlineStyle: 'none' as never },
  timeHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  timeHintText: { color: colors.dim, fontSize: 9, lineHeight: 14, flex: 1 },
  formInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, marginTop: 18, borderRadius: 11, backgroundColor: EVENT_ACCENT_SOFT, borderWidth: 1, borderColor: EVENT_LINE },
  formInfoText: { color: colors.muted, fontSize: 10, lineHeight: 15, flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 20 },
  cancelButton: { minHeight: 39, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  submitButton: { minHeight: 39, paddingHorizontal: 16, borderRadius: 10, backgroundColor: EVENT_ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  submitButtonText: { color: '#17130E', fontSize: 11, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  peopleList: { flexGrow: 0, maxHeight: 390, paddingHorizontal: 17 },
  peopleRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 9 },
  peopleCopy: { flex: 1, minWidth: 0 },
  peopleName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  peopleUsername: { color: colors.dim, fontSize: 10, marginTop: 4 },
  selectionBox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1, borderColor: colors.dim, alignItems: 'center', justifyContent: 'center' },
  selectionBoxSelected: { backgroundColor: EVENT_ACCENT, borderColor: EVENT_ACCENT },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 13, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  modalFootnote: { color: colors.dim, fontSize: 10, flex: 1 },
  modalSectionLabel: { color: colors.dim, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, paddingHorizontal: 20, paddingTop: 17, paddingBottom: 5 },
  addBlockButton: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: EVENT_ACCENT, paddingHorizontal: 13, marginHorizontal: 20, marginTop: 15 },
  addBlockButtonText: { color: '#17130E', fontSize: 10, fontWeight: '900' },
  unblockButton: { minHeight: 31, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  unblockText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  readOnlyTag: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: colors.surfaceRaised },
  readOnlyTagText: { color: colors.dim, fontSize: 9, fontWeight: '800' },
  searchPeopleRow: { minHeight: 43, marginHorizontal: 19, marginTop: 17, marginBottom: 8, paddingLeft: 11, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchAction: { width: 35, height: 35, marginRight: 4, borderRadius: 9, backgroundColor: EVENT_ACCENT, alignItems: 'center', justifyContent: 'center' },
  blockAction: { minHeight: 32, paddingHorizontal: 11, borderRadius: 9, backgroundColor: EVENT_ACCENT, alignItems: 'center', justifyContent: 'center' },
  blockActionDisabled: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  blockActionText: { color: '#17130E', fontSize: 10, fontWeight: '900' },
  blockActionTextDisabled: { color: colors.dim },
  noSearchResults: { color: colors.dim, fontSize: 11, lineHeight: 17, padding: 20, textAlign: 'center' },
  confirmIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: 'rgba(224,140,140,0.10)', borderWidth: 1, borderColor: 'rgba(224,140,140,0.24)', alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 15 },
  confirmBody: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  deleteConfirmButton: { minHeight: 39, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#B65353', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  deleteConfirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
