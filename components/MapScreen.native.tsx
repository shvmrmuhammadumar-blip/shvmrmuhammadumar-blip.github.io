import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Callout, Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, radii } from '../lib/theme';
import {
  disableLocationSharing,
  enableLocationSharing,
  getLocationSharingState,
} from '../lib/location-sharing';
import { useThemedStyles } from "../lib/theme-styles";
import { usePreferences } from '../lib/preferences';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type FriendLocation = Coordinate & {
  id: string;
  username: string;
  avatar_url: string | null;
  updated_at: string;
};

const WORLD_REGION: Region = {
  latitude: 24,
  longitude: 8,
  latitudeDelta: 92,
  longitudeDelta: 150,
};



function relativeTime(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MapScreen() {
  const lumoStyles = useThemedStyles(styles);
  const { palette } = usePreferences();
  const themedMapStyle = useMemo(() => [
    { elementType: 'geometry', stylers: [{ color: palette.surface }] },
    { elementType: 'labels.text.fill', stylers: [{ color: palette.muted }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: palette.bg }] },
    { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: palette.border }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: palette.surface }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: palette.surfaceRaised }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: palette.muted }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: palette.surfaceSoft }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: palette.surface }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: palette.text }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: palette.accentSoft }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: palette.accentSoft }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: palette.muted }] },
  ], [palette]);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id;
  const mapRef = useRef<MapView>(null);
  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [myCoordinate, setMyCoordinate] = useState<Coordinate | null>(null);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const collapsedPanelHeight = Math.min(320, Math.max(260, windowHeight * 0.34));
  const expandedPanelHeight = Math.min(620, Math.max(collapsedPanelHeight + 100, windowHeight * 0.7));
  const panelHeight = useRef(new Animated.Value(collapsedPanelHeight)).current;

  useEffect(() => {
    const animation = Animated.spring(panelHeight, {
      toValue: panelExpanded ? expandedPanelHeight : collapsedPanelHeight,
      useNativeDriver: false,
      bounciness: 0,
      speed: 20,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsedPanelHeight, expandedPanelHeight, panelExpanded, panelHeight]);

  const panelPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dy) > 6,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -24) setPanelExpanded(true);
      else if (gesture.dy > 24) setPanelExpanded(false);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);

  const loadFriends = useCallback(async () => {
    if (!userId) return;

    const { data: followRows, error: followError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);

    if (followError) throw followError;

    const ids = (followRows ?? []).map((row) => row.following_id);
    if (ids.length === 0) {
      setFriends([]);
      return;
    }

    const [{ data: locationRows, error: locationError }, { data: profiles, error: profileError }] =
      await Promise.all([
        supabase
          .from('user_locations')
          .select('user_id, latitude, longitude, updated_at')
          .in('user_id', ids),
        supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', ids),
      ]);

    if (locationError) throw locationError;
    if (profileError) throw profileError;

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const next = (locationRows ?? []).flatMap((location) => {
      const profile = profileById.get(location.user_id);
      if (!profile) return [];
      return [{
        id: location.user_id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        latitude: location.latitude,
        longitude: location.longitude,
        updated_at: location.updated_at,
      }];
    });

    setFriends(next);
  }, [userId]);

  const loadScreen = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const state = await getLocationSharingState(userId);
      setSharingEnabled(Boolean(state?.sharing_enabled));
      if (state) {
        setMyCoordinate({ latitude: state.latitude, longitude: state.longitude });
        setLastUpdated(state.updated_at);
      }

      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.granted && !state) {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          setMyCoordinate({
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          });
        }
      }

      await loadFriends();
    } catch (error) {
      Alert.alert('Map could not load', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loadFriends, userId]);

  useEffect(() => {
    void loadScreen();
  }, [loadScreen]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`lumo-map-locations:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_locations' },
        () => { void loadFriends(); },
      )
      .subscribe();

    const refresh = setInterval(() => { void loadFriends(); }, 30000);

    return () => {
      clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadFriends, userId]);

  const visibleFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query
      ? friends.filter((friend) => friend.username.toLowerCase().includes(query))
      : friends;
    return list.sort((a, b) => a.username.localeCompare(b.username));
  }, [friends, search]);

  const centerOnMe = async () => {
    setLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Location permission was not granted.');

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coordinate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setMyCoordinate(coordinate);
      mapRef.current?.animateToRegion({
        ...coordinate,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }, 650);
    } catch (error) {
      Alert.alert('Your location', error instanceof Error ? error.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const toggleSharing = async (nextValue: boolean) => {
    if (!userId || saving) return;
    setSaving(true);

    try {
      if (nextValue) {
        const location = await enableLocationSharing(userId);
        const coordinate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
        setMyCoordinate(coordinate);
        setLastUpdated(new Date().toISOString());
        setSharingEnabled(true);
        mapRef.current?.animateToRegion({
          ...coordinate,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }, 650);
      } else {
        await disableLocationSharing(userId);
        setSharingEnabled(false);
      }
    } catch (error) {
      Alert.alert(
        nextValue ? 'Could not enable location sharing' : 'Could not turn off Ghost Mode',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const mapRegion = myCoordinate
    ? { ...myCoordinate, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : WORLD_REGION;

  return (
    <View style={lumoStyles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={mapRegion}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={themedMapStyle}
        showsCompass={false}
        showsScale={false}
        showsUserLocation={false}
        toolbarEnabled={false}
        rotateEnabled
        pitchEnabled={false}
        loadingEnabled
        loadingBackgroundColor={colors.bg}
        loadingIndicatorColor={colors.accent}
      >
        {myCoordinate ? (
          <Marker coordinate={myCoordinate} tracksViewChanges={false} zIndex={10}>
            <View style={lumoStyles.myMarker}>
              <View style={lumoStyles.myMarkerCore} />
            </View>
            <Callout>
              <View style={lumoStyles.callout}>
                <Text style={lumoStyles.calloutTitle}>You</Text>
                <Text style={lumoStyles.calloutSubtitle}>
                  {sharingEnabled ? 'Sharing your live location' : 'Only visible to you'}
                </Text>
              </View>
            </Callout>
          </Marker>
        ) : null}

        {friends.map((friend) => (
          <Marker
            key={friend.id}
            coordinate={{ latitude: friend.latitude, longitude: friend.longitude }}
            tracksViewChanges={false}
          >
            <View style={lumoStyles.friendMarker}>
              {friend.avatar_url ? (
                <Image source={{ uri: friend.avatar_url }} style={lumoStyles.friendMarkerImage} contentFit="cover" />
              ) : (
                <View style={lumoStyles.friendMarkerFallback}>
                  <Ionicons name="person" size={17} color={colors.text} />
                </View>
              )}
              <View style={lumoStyles.friendMarkerDot} />
            </View>
            <Callout>
              <View style={lumoStyles.callout}>
                <Text style={lumoStyles.calloutTitle}>@{friend.username}</Text>
                <Text style={lumoStyles.calloutSubtitle}>Updated {relativeTime(friend.updated_at)}</Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={[lumoStyles.topOverlay, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
        <View style={lumoStyles.topRow}>
          <View>
            <Text style={lumoStyles.eyebrow}>LUMO / PLACES</Text>
            <Text style={lumoStyles.title}>Map</Text>
          </View>
          <View style={[lumoStyles.statusPill, sharingEnabled ? lumoStyles.statusLive : lumoStyles.statusPrivate]}>
            <View style={[lumoStyles.statusDot, sharingEnabled && lumoStyles.statusDotLive]} />
            <Text style={lumoStyles.statusText}>{sharingEnabled ? 'LIVE SHARING' : 'GHOST MODE'}</Text>
          </View>
        </View>

        <View style={lumoStyles.searchBox}>
          <Ionicons name="search" size={19} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find people you follow"
            placeholderTextColor={colors.dim}
            style={lumoStyles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={lumoStyles.mapControls}>
        <Pressable style={lumoStyles.mapControlButton} onPress={() => void centerOnMe()} accessibilityRole="button" accessibilityLabel="Center on my location">
          {locating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="locate-outline" size={21} color={colors.text} />}
        </Pressable>
        <Pressable style={lumoStyles.mapControlButton} onPress={() => mapRef.current?.animateCamera({ zoom: 15 }, { duration: 350 })} accessibilityRole="button" accessibilityLabel="Zoom in">
          <Ionicons name="add" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={lumoStyles.mapControlButton} onPress={() => mapRef.current?.animateCamera({ zoom: 4 }, { duration: 350 })} accessibilityRole="button" accessibilityLabel="Zoom out to world">
          <Ionicons name="globe-outline" size={19} color={colors.text} />
        </Pressable>
      </View>

      <Animated.View style={[lumoStyles.bottomPanel, { height: panelHeight, paddingBottom: Math.max(insets.bottom, 12) + 76 }]}>
        <View style={lumoStyles.handleTouchArea} {...panelPanResponder.panHandlers}>
          <Pressable
            onPress={() => setPanelExpanded((current) => !current)}
            style={lumoStyles.handleButton}
            accessibilityRole="button"
            accessibilityLabel={panelExpanded ? 'Collapse map panel' : 'Expand map panel'}
            accessibilityState={{ expanded: panelExpanded }}
          >
            <View style={lumoStyles.panelHandle} />
          </Pressable>
        </View>

        <View style={lumoStyles.panelHeader}>
          <View style={lumoStyles.panelHeadingCopy}>
            <Text style={lumoStyles.panelEyebrow}>YOUR CIRCLE</Text>
            <Text style={lumoStyles.panelTitle}>Following on map <Text style={lumoStyles.countText}>{friends.length}</Text></Text>
          </View>
          <Pressable style={lumoStyles.refreshButton} onPress={() => void loadScreen()} accessibilityRole="button" accessibilityLabel="Refresh map">
            <Ionicons name="refresh" size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={lumoStyles.privacyRow}>
          <View style={lumoStyles.privacyIcon}>
            <Ionicons name={sharingEnabled ? 'navigate' : 'eye-off-outline'} size={19} color={colors.text} />
          </View>
          <View style={lumoStyles.privacyCopy}>
            <Text style={lumoStyles.privacyTitle}>{sharingEnabled ? 'Location sharing is on' : 'Ghost Mode is on'}</Text>
            <Text style={lumoStyles.privacySubtitle}>
              {sharingEnabled
                ? 'People you follow can see your live location.'
                : 'Your location is hidden from everyone else.'}
            </Text>
          </View>
          {saving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Switch
              value={sharingEnabled}
              onValueChange={toggleSharing}
              trackColor={{ false: palette.surfaceSoft, true: palette.successSoft }}
              thumbColor={sharingEnabled ? palette.success : palette.text}
              accessibilityLabel="Location sharing"
            />
          )}
        </View>

        {panelExpanded ? (
          <>
            {lastUpdated && sharingEnabled ? (
              <Text style={lumoStyles.updatedText}>Your location updated {relativeTime(lastUpdated)}</Text>
            ) : null}

            {loading ? (
              <View style={lumoStyles.emptyRow}>
                <ActivityIndicator color={colors.accent} />
                <Text style={lumoStyles.emptyText}>Finding your circle…</Text>
              </View>
            ) : visibleFriends.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={lumoStyles.friendList}>
                {visibleFriends.map((friend) => (
                  <Pressable
                    key={friend.id}
                    style={lumoStyles.friendItem}
                    onPress={() => mapRef.current?.animateToRegion({
                      latitude: friend.latitude,
                      longitude: friend.longitude,
                      latitudeDelta: 0.025,
                      longitudeDelta: 0.025,
                    }, 550)}
                  >
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={lumoStyles.friendAvatar} contentFit="cover" />
                    ) : (
                      <View style={[lumoStyles.friendAvatar, lumoStyles.friendAvatarFallback]}>
                        <Ionicons name="person" size={19} color={colors.text} />
                      </View>
                    )}
                    <Text style={lumoStyles.friendName} numberOfLines={1}>@{friend.username}</Text>
                    <Text style={lumoStyles.friendTime}>{relativeTime(friend.updated_at)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={lumoStyles.emptyRow}>
                <Ionicons name="people-outline" size={20} color={colors.dim} />
                <Text style={lumoStyles.emptyText}>
                  {search ? 'No matching people sharing their location.' : 'No one you follow is sharing their location yet.'}
                </Text>
              </View>
            )}
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: 'rgba(9, 12, 18, 0.94)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(224, 232, 240, 0.08)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 2.1, fontWeight: '800' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1 },
  statusLive: { backgroundColor: 'rgba(117, 139, 126, 0.15)', borderColor: 'rgba(158, 190, 174, 0.35)' },
  statusPrivate: { backgroundColor: 'rgba(154, 165, 178, 0.10)', borderColor: colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dim },
  statusDotLive: { backgroundColor: colors.success },
  statusText: { color: colors.text, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  searchBox: { height: 48, borderRadius: 15, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(26, 32, 41, 0.96)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  mapControls: { position: 'absolute', right: 15, top: '42%', gap: 9 },
  mapControlButton: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18, 22, 28, 0.96)', borderWidth: 1, borderColor: colors.glassBorder },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12, 16, 22, 0.98)', borderTopLeftRadius: 25, borderTopRightRadius: 25, borderTopWidth: 1, borderColor: colors.glassBorder, paddingHorizontal: 18, paddingTop: 8, overflow: 'hidden' },
  handleTouchArea: { height: 34, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  handleButton: { width: 104, height: 34, alignItems: 'center', justifyContent: 'center' },
  panelHandle: { alignSelf: 'center', width: 50, height: 5, borderRadius: 3, backgroundColor: '#778390' },
  panelHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  panelEyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.8, fontWeight: '800' },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  countText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  refreshButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 17, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  privacyIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  privacyCopy: { flex: 1 },
  privacyTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  privacySubtitle: { color: colors.muted, fontSize: 10, marginTop: 4, lineHeight: 14 },
  updatedText: { color: colors.dim, fontSize: 9, marginTop: 7, marginLeft: 5 },
  friendList: { gap: 16, paddingVertical: 13, paddingHorizontal: 2 },
  friendItem: { width: 66, alignItems: 'center' },
  friendAvatar: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: colors.success },
  friendAvatarFallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  friendName: { color: colors.text, fontSize: 10, fontWeight: '700', marginTop: 6, maxWidth: 66 },
  friendTime: { color: colors.dim, fontSize: 9, marginTop: 2 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 16, minHeight: 48 },
  emptyText: { color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 },
  myMarker: { width: 23, height: 23, borderRadius: 12, backgroundColor: 'rgba(224, 232, 240, 0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E8F0' },
  myMarkerCore: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#E0E8F0' },
  friendMarker: { width: 43, height: 43, borderRadius: 22, borderWidth: 2, borderColor: colors.success, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  friendMarkerImage: { width: 39, height: 39, borderRadius: 20 },
  friendMarkerFallback: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  friendMarkerDot: { position: 'absolute', width: 9, height: 9, borderRadius: 5, right: -1, bottom: -1, backgroundColor: colors.success, borderWidth: 1.5, borderColor: colors.bg },
  callout: { minWidth: 130, padding: 5 },
  calloutTitle: { color: '#111820', fontSize: 13, fontWeight: '800' },
  calloutSubtitle: { color: '#52606D', fontSize: 10, marginTop: 3 },
});
