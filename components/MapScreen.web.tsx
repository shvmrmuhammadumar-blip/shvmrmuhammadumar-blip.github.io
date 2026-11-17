import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as L from 'leaflet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { colors, radii } from '../lib/theme';

type Coordinate = { latitude: number; longitude: number };
type FriendLocation = Coordinate & {
  id: string;
  username: string;
  avatar_url: string | null;
  updated_at: string;
};
type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown' | 'unsupported';

const WORLD_CENTER: [number, number] = [24, 8];
const CARTO_API_KEY = process.env.EXPO_PUBLIC_CARTO_API_KEY?.trim();

function relativeTime(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support location access.'));
      return;
    }
    if (!window.isSecureContext) {
      reject(new Error('Location access requires HTTPS. Use localhost while testing.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject(new Error('Location permission is blocked. Allow it in your browser address-bar settings.'));
        else if (error.code === error.POSITION_UNAVAILABLE) reject(new Error('Your current location is unavailable.'));
        else reject(new Error('Location request timed out. Try again.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

function saveCoordinates(userId: string, position: GeolocationPosition) {
  return supabase.from('user_locations').upsert({
    user_id: userId,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy_meters: position.coords.accuracy,
    heading_degrees: position.coords.heading,
    speed_mps: position.coords.speed,
  }, { onConflict: 'user_id' });
}

function distanceMeters(a: Coordinate, b: Coordinate) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export default function MapScreenWeb() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id;
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const friendLayerRef = useRef<L.LayerGroup | null>(null);
  const ownMarkerRef = useRef<L.CircleMarker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSavedAtRef = useRef(0);
  const lastSavedCoordinateRef = useRef<Coordinate | null>(null);

  const [friends, setFriends] = useState<FriendLocation[]>([]);
  const [myCoordinate, setMyCoordinate] = useState<Coordinate | null>(null);
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown');
  const [message, setMessage] = useState('');

  const loadFriends = useCallback(async () => {
    if (!userId) return;
    const { data: followRows, error: followError } = await supabase
      .from('follows').select('following_id').eq('follower_id', userId);
    if (followError) throw followError;

    const ids = (followRows ?? []).map((row) => row.following_id);
    if (!ids.length) {
      setFriends([]);
      return;
    }

    const [{ data: locations, error: locationsError }, { data: profiles, error: profilesError }] =
      await Promise.all([
        supabase.from('user_locations')
          .select('user_id, latitude, longitude, updated_at')
          .in('user_id', ids),
        supabase.from('profiles')
          .select('id, username, avatar_url')
          .in('id', ids),
      ]);
    if (locationsError) throw locationsError;
    if (profilesError) throw profilesError;

    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const next = (locations ?? []).flatMap((location) => {
      const profile = byId.get(location.user_id);
      if (!profile) return [];
      return [{
        id: location.user_id,
        username: profile.username ?? 'user',
        avatar_url: profile.avatar_url,
        latitude: location.latitude,
        longitude: location.longitude,
        updated_at: location.updated_at,
      }];
    });
    setFriends(next);
  }, [userId]);

  const loadScreen = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const { data: state, error } = await supabase
        .from('user_locations')
        .select('sharing_enabled, latitude, longitude, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      setSharingEnabled(Boolean(state?.sharing_enabled));
      if (state) {
        const coordinate = { latitude: state.latitude, longitude: state.longitude };
        setMyCoordinate(coordinate);
        lastSavedCoordinateRef.current = coordinate;
        setLastUpdated(state.updated_at);
        lastSavedAtRef.current = Date.now();
      }
      await loadFriends();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The map could not load. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loadFriends, userId]);

  useEffect(() => {
    let mounted = true;
    let permissionResult: PermissionStatus | null = null;
    const updatePermission = () => {
      if (mounted && permissionResult) {
        setPermissionState(permissionResult.state as PermissionState);
      }
    };
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
    } else if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((permission) => {
        if (!mounted) return;
        permissionResult = permission;
        updatePermission();
        permission.addEventListener('change', updatePermission);
        if (permission.state === 'granted') {
          navigator.geolocation.getCurrentPosition((position) => {
            if (!mounted) return;
            const coordinate = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            setMyCoordinate(coordinate);
            mapRef.current?.flyTo([coordinate.latitude, coordinate.longitude], 12, { duration: 0.65 });
          }, () => undefined, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 15000,
          });
        }
      }).catch(() => {
        if (mounted) setPermissionState('unknown');
      });
    }
    return () => {
      mounted = false;
      permissionResult?.removeEventListener('change', updatePermission);
    };
  }, []);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    if (!document.querySelector('link[data-lumo-leaflet-styles]')) {
      const leafletStylesheet = document.createElement('link');
      leafletStylesheet.rel = 'stylesheet';
      leafletStylesheet.href = '/vendor/leaflet/leaflet.css';
      leafletStylesheet.setAttribute('data-lumo-leaflet-styles', 'true');
      document.head.appendChild(leafletStylesheet);
    }
    const mapStyles = document.createElement('style');
    mapStyles.textContent = `
      .leaflet-container { background: #151A20; font-family: Arial, sans-serif; }
      ${CARTO_API_KEY ? '' : '.leaflet-tile-pane { filter: invert(100%) hue-rotate(180deg) brightness(82%) contrast(88%) saturate(45%); }'}
      .leaflet-div-icon.lumo-friend-icon { background: transparent; border: 0; }
      .lumo-friend-icon span {
        display: flex; width: 40px; height: 40px; align-items: center; justify-content: center;
        border-radius: 50%; color: #F2F5F7; background: #1A2029;
        border: 2px solid #9EBEAE; box-shadow: 0 4px 16px rgba(0,0,0,.45);
        font-size: 13px; font-weight: 800;
      }
      .leaflet-tooltip {
        color: #F2F5F7; background: #12161C; border: 1px solid #39434D;
        border-radius: 9px; box-shadow: 0 5px 18px rgba(0,0,0,.35); padding: 7px 10px;
      }
      .leaflet-tooltip:before { display: none; }
      .leaflet-control-attribution { background: rgba(12,16,22,.82) !important; color: #AEB8C3 !important; }
      .leaflet-control-attribution a { color: #DCE4EC !important; }
    `;
    document.head.appendChild(mapStyles);
    const map = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true,
    }).setView(WORLD_CENTER, 2);
    const tileLayer = CARTO_API_KEY
      ? L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_API_KEY)}`, {
          subdomains: 'abcd',
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        })
      : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        });
    tileLayer.addTo(map);
    friendLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 120);
    return () => {
      map.remove();
      mapStyles.remove();
      mapRef.current = null;
      friendLayerRef.current = null;
      ownMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadScreen();
  }, [loadScreen]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`lumo-map-web:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' }, () => {
        void loadFriends();
      })
      .subscribe();
    const refresh = window.setInterval(() => { void loadFriends(); }, 30000);
    return () => {
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [loadFriends, userId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (ownMarkerRef.current) {
      ownMarkerRef.current.remove();
      ownMarkerRef.current = null;
    }
    if (myCoordinate) {
      ownMarkerRef.current = L.circleMarker(
        [myCoordinate.latitude, myCoordinate.longitude],
        { radius: 8, color: '#F1F4F7', weight: 3, fillColor: '#F1F4F7', fillOpacity: 1 },
      ).addTo(map);
      const ownLabel = document.createElement('span');
      ownLabel.textContent = sharingEnabled ? 'Your live location' : 'Your location (private)';
      ownMarkerRef.current.bindTooltip(ownLabel);
    }
  }, [myCoordinate, sharingEnabled]);

  useEffect(() => {
    const layer = friendLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    friends.forEach((friend) => {
      const initial = (friend.username.trim()[0] || 'U').toUpperCase();
      const icon = L.divIcon({
        className: 'lumo-friend-icon',
        html: `<span>${initial.replace(/[&<>"']/g, '')}</span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const marker = L.marker([friend.latitude, friend.longitude], { icon }).addTo(layer);
      const label = document.createElement('span');
      label.textContent = `@${friend.username} · ${relativeTime(friend.updated_at)}`;
      marker.bindTooltip(label, { direction: 'top', offset: [0, -18] });
      marker.on('click', () => {
        mapRef.current?.flyTo([friend.latitude, friend.longitude], 13, { duration: 0.55 });
      });
    });
  }, [friends]);

  useEffect(() => {
    if (!sharingEnabled || !userId || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(async (position) => {
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setMyCoordinate(coordinate);
      const elapsed = Date.now() - lastSavedAtRef.current;
      const moved = lastSavedCoordinateRef.current
        ? distanceMeters(lastSavedCoordinateRef.current, coordinate)
        : Number.POSITIVE_INFINITY;
      if (elapsed < 30000 && moved < 20) return;
      const { error } = await saveCoordinates(userId, position);
      if (!error) {
        lastSavedAtRef.current = Date.now();
        lastSavedCoordinateRef.current = coordinate;
        setLastUpdated(new Date().toISOString());
      }
    }, (error) => {
      setMessage(error.code === error.PERMISSION_DENIED
        ? 'Browser location permission was revoked. Re-enable it in site settings.'
        : 'Your browser could not refresh the live location.');
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    watchIdRef.current = watchId;
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [sharingEnabled, userId]);

  const visibleFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...friends]
      .filter((friend) => !query || friend.username.toLowerCase().includes(query))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [friends, search]);

  const centerOnMe = async () => {
    setLocating(true);
    setMessage('');
    try {
      const position = await getBrowserPosition();
      const coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setMyCoordinate(coordinate);
      mapRef.current?.flyTo([coordinate.latitude, coordinate.longitude], 14, { duration: 0.7 });
      setPermissionState('granted');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const toggleSharing = async (nextValue: boolean) => {
    if (!userId || saving) return;
    setSaving(true);
    setMessage('');
    try {
      if (nextValue) {
        const position = await getBrowserPosition();
        const { error: saveError } = await saveCoordinates(userId, position);
        if (saveError) throw saveError;
        const { error: enableError } = await supabase
          .from('user_locations').update({ sharing_enabled: true }).eq('user_id', userId);
        if (enableError) throw enableError;
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setMyCoordinate(coordinate);
        lastSavedCoordinateRef.current = coordinate;
        lastSavedAtRef.current = Date.now();
        setLastUpdated(new Date().toISOString());
        setPermissionState('granted');
        setSharingEnabled(true);
        mapRef.current?.flyTo([coordinate.latitude, coordinate.longitude], 13, { duration: 0.7 });
      } else {
        const { error } = await supabase
          .from('user_locations').update({ sharing_enabled: false }).eq('user_id', userId);
        if (error) throw error;
        setSharingEnabled(false);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update location sharing.');
    } finally {
      setSaving(false);
    }
  };

  const focusFriend = (friend: FriendLocation) => {
    mapRef.current?.flyTo([friend.latitude, friend.longitude], 13, { duration: 0.55 });
  };

  return (
    <View style={styles.screen}>
      <div
        ref={mapElementRef}
        aria-label="Lumo world map"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#151A20', zIndex: 0 }}
      />

      <View pointerEvents="box-none" style={[styles.topOverlay, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>LUMO / PLACES</Text>
            <Text style={styles.title}>Map</Text>
          </View>
          <View style={[styles.statusPill, sharingEnabled ? styles.statusLive : styles.statusPrivate]}>
            <View style={[styles.statusDot, sharingEnabled && styles.statusDotLive]} />
            <Text style={styles.statusText}>{sharingEnabled ? 'LIVE SHARING' : 'GHOST MODE'}</Text>
          </View>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Find people you follow"
            placeholderTextColor={colors.dim}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.mapControls}>
        <Pressable style={styles.mapControlButton} onPress={() => void centerOnMe()} accessibilityRole="button" accessibilityLabel="Center on my location">
          {locating ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="locate-outline" size={20} color={colors.text} />}
        </Pressable>
        <Pressable style={styles.mapControlButton} onPress={() => mapRef.current?.zoomIn()} accessibilityRole="button" accessibilityLabel="Zoom in">
          <Ionicons name="add" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={styles.mapControlButton} onPress={() => mapRef.current?.zoomOut()} accessibilityRole="button" accessibilityLabel="Zoom out">
          <Ionicons name="remove" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 12) + 72 }]}>
        <View style={styles.panelHandle} />
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.panelEyebrow}>YOUR CIRCLE</Text>
            <Text style={styles.panelTitle}>Following on map <Text style={styles.countText}>{friends.length}</Text></Text>
          </View>
          <Pressable style={styles.refreshButton} onPress={() => void loadScreen()} accessibilityRole="button" accessibilityLabel="Refresh map">
            <Ionicons name="refresh" size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.privacyRow}>
          <View style={styles.privacyIcon}>
            <Ionicons name={sharingEnabled ? 'navigate' : 'eye-off-outline'} size={18} color={colors.text} />
          </View>
          <View style={styles.privacyCopy}>
            <Text style={styles.privacyTitle}>{sharingEnabled ? 'Location sharing is on' : 'Ghost Mode is on'}</Text>
            <Text style={styles.privacySubtitle}>
              {sharingEnabled ? 'People you follow can see your live location.' : 'Your location is hidden from everyone else.'}
            </Text>
          </View>
          {saving ? <ActivityIndicator color={colors.accent} /> : (
            <Switch
              value={sharingEnabled}
              onValueChange={toggleSharing}
              trackColor={{ false: '#343C45', true: '#758B7E' }}
              thumbColor={sharingEnabled ? '#E6EFE8' : '#D7DDE3'}
              accessibilityLabel="Location sharing"
            />
          )}
        </View>

        <View style={styles.webNote}>
          <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
          <Text style={styles.webNoteText}>On the web, live updates work while this page remains open. Use the mobile app for background sharing.</Text>
        </View>

        {lastUpdated && sharingEnabled ? (
          <Text style={styles.updatedText}>Your location updated {relativeTime(lastUpdated)}</Text>
        ) : null}

        {message ? <Text style={styles.messageText}>{message}</Text> : null}

        {loading ? (
          <View style={styles.emptyRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.emptyText}>Loading your circle…</Text>
          </View>
        ) : visibleFriends.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>
            {visibleFriends.map((friend) => (
              <Pressable key={friend.id} style={styles.friendItem} onPress={() => focusFriend(friend)}>
                {friend.avatar_url ? (
                  <Image source={{ uri: friend.avatar_url }} style={styles.friendAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.friendAvatar, styles.friendAvatarFallback]}>
                    <Ionicons name="person" size={18} color={colors.text} />
                  </View>
                )}
                <Text style={styles.friendName} numberOfLines={1}>@{friend.username}</Text>
                <Text style={styles.friendTime}>{relativeTime(friend.updated_at)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptyRow}>
            <Ionicons name="people-outline" size={19} color={colors.dim} />
            <Text style={styles.emptyText}>
              {search ? 'No matching people sharing their location.' : 'No one you follow is sharing their location yet.'}
            </Text>
          </View>
        )}

        <View style={styles.permissionRow}>
          <Ionicons
            name={permissionState === 'granted' ? 'location' : permissionState === 'denied' ? 'location-outline' : 'shield-checkmark-outline'}
            size={14}
            color={permissionState === 'denied' ? colors.danger : colors.muted}
          />
          <Text style={styles.permissionText}>
            {permissionState === 'granted' ? 'Browser location permission: allowed' :
              permissionState === 'denied' ? 'Browser location permission: blocked' :
                permissionState === 'unsupported' ? 'This browser does not support geolocation' :
                  'Location is only requested when you choose to locate or share'}
          </Text>
        </View>
      </View>

      <Text style={styles.attribution}>{CARTO_API_KEY ? '© OpenStreetMap contributors · CARTO' : '© OpenStreetMap contributors'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 620, backgroundColor: colors.bg, position: 'relative', overflow: 'hidden' },
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 500,
    paddingHorizontal: 18, paddingBottom: 14,
    backgroundColor: 'rgba(9, 12, 18, 0.94)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(224, 232, 240, 0.08)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  eyebrow: { color: colors.muted, fontSize: 10, letterSpacing: 2.1, fontWeight: '800' },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1 },
  statusLive: { backgroundColor: 'rgba(117, 139, 126, 0.15)', borderColor: 'rgba(158, 190, 174, 0.35)' },
  statusPrivate: { backgroundColor: 'rgba(154, 165, 178, 0.10)', borderColor: colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dim },
  statusDotLive: { backgroundColor: colors.success },
  statusText: { color: colors.text, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  searchBox: { height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(26, 32, 41, 0.96)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13 },
  searchInput: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 0 },
  mapControls: { position: 'absolute', right: 15, top: '41%', zIndex: 500, gap: 8 },
  mapControlButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(18, 22, 28, 0.96)', borderWidth: 1, borderColor: colors.glassBorder },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 500, backgroundColor: 'rgba(12, 16, 22, 0.97)', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.glassBorder, paddingHorizontal: 18, paddingTop: 9 },
  panelHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#4A535E', marginBottom: 13 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  panelEyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.8, fontWeight: '800' },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 4 },
  countText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  refreshButton: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  privacyIcon: { width: 37, height: 37, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  privacyCopy: { flex: 1 },
  privacyTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  privacySubtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 14 },
  webNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 9 },
  webNoteText: { color: colors.muted, fontSize: 9, flex: 1, lineHeight: 13 },
  updatedText: { color: colors.dim, fontSize: 9, marginTop: 6, marginLeft: 4 },
  messageText: { color: colors.danger, fontSize: 10, marginTop: 7, lineHeight: 15 },
  friendList: { gap: 14, paddingVertical: 10, paddingHorizontal: 2 },
  friendItem: { width: 64, alignItems: 'center' },
  friendAvatar: { width: 41, height: 41, borderRadius: 21, borderWidth: 2, borderColor: colors.success },
  friendAvatarFallback: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  friendName: { color: colors.text, fontSize: 9, fontWeight: '700', marginTop: 5, maxWidth: 64 },
  friendTime: { color: colors.dim, fontSize: 9, marginTop: 2 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 44 },
  emptyText: { color: colors.muted, fontSize: 10, flex: 1, lineHeight: 15 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 5, paddingBottom: 3 },
  permissionText: { color: colors.dim, fontSize: 9 },
  attribution: { position: 'absolute', left: 7, bottom: 7, zIndex: 400, color: '#AEB8C3', fontSize: 9, padding: 3, backgroundColor: 'rgba(12,16,22,0.82)' },
});
