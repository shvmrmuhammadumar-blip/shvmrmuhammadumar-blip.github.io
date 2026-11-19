import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Alert } from '../../lib/alert';
import { supabase } from '../../lib/supabase';
import {
  activateLiveSession,
  getLiveSession,
  getLiveSessionByCode,
  getMyLiveParticipant,
  joinLiveSession,
  leaveLiveStage,
  loadGuestRequests,
  loadLiveMessages,
  loadLiveParticipants,
  requestLiveStage,
  releaseLiveGuestRequest,
  respondToLiveStageRequest,
  sendLiveMessage,
  takeLiveStage,
  type LiveGuestRequest,
  type LiveMessage,
  type LiveParticipant,
  type LiveRole,
  type LiveSession,
} from '../../lib/live';
import LiveRoom from '../../components/live/LiveRoom';

const db = supabase as any;

function ago(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function avatarInitial(name?: string | null) {
  return (name?.trim()[0] || 'L').toUpperCase();
}

export default function LiveSessionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const requestedLiveId = String(params.id ?? '');
  const router = useRouter();
  const { session: authSession } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const wideLayout = windowWidth >= 920;
  const userId = authSession?.user.id;

  const [live, setLive] = useState<LiveSession | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [participant, setParticipant] = useState<LiveParticipant | null>(null);
  const [role, setRole] = useState<LiveRole>('viewer');
  const [participants, setParticipants] = useState<LiveParticipant[]>([]);
  const [requests, setRequests] = useState<LiveGuestRequest[]>([]);
  const [myRequest, setMyRequest] = useState<{ id: string; status: string } | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [mutedGuestIds, setMutedGuestIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const hostActivationRef = useRef(false);

  const isHost = live?.host_id === userId && role === 'host';
  const guests = useMemo(() => participants.filter(item => item.role === 'guest' && item.status === 'joined'), [participants]);
  const viewers = useMemo(() => participants.filter(item => item.role === 'viewer' && item.status === 'joined'), [participants]);
  const displayName = live?.host?.username ?? 'LUMO creator';

  const refreshParticipants = useCallback(async () => {
    if (!sessionId) return;
    try {
      setParticipants(await loadLiveParticipants(sessionId));
      if (!userId || live?.status !== 'live') return;

      let mine = await getMyLiveParticipant(sessionId, userId);
      if (!mine || mine.status !== 'joined') {
        mine = await joinLiveSession(sessionId, userId);
      }
      if (mine) {
        setParticipant(mine);
        setRole(mine.role);
      }
    } catch {
      // Keep the last known participant list while transient realtime updates settle.
    }
  }, [sessionId, userId, live?.status]);

  const refreshGuestRequests = useCallback(async () => {
    if (!sessionId || !userId) return;
    try {
      if (live?.host_id === userId) {
        setRequests(await loadGuestRequests(sessionId));
      } else {
        const { data, error: requestError } = await db
          .from('live_guest_requests')
          .select('id, status')
          .eq('session_id', sessionId)
          .eq('requester_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);
        if (!requestError) setMyRequest(data?.[0] ?? null);
      }
    } catch {
      // RLS can hide host-only requests from regular viewers by design.
    }
  }, [sessionId, userId, live?.host_id]);

  const refreshMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      setMessages(await loadLiveMessages(sessionId));
    } catch {
      // Chat remains usable if an older message is temporarily unavailable.
    }
  }, [sessionId]);

  const refreshSession = useCallback(async () => {
    if (!sessionId) return;
    const next = await getLiveSession(sessionId);
    setLive(next);
    if (next.status === 'ended' || next.status === 'failed') setEnded(true);
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    if (!userId) { setIsDeveloper(false); return () => { active = false; }; }
    void db.rpc('is_platform_developer').then(({ data, error: roleError }: { data: boolean | null; error: unknown }) => {
      if (active) setIsDeveloper(!roleError && data === true);
    }).catch(() => { if (active) setIsDeveloper(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    const initialise = async () => {
      setSessionId('');
      setLive(null);
      setEnded(false);
      if (!userId) {
        setLoading(false);
        return;
      }
      const isShortCode = /^[0-9]{8}$/.test(requestedLiveId);
      const isLegacyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedLiveId);
      if (!isShortCode && !isLegacyUuid) {
        setError('This LIVE ID is not valid.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const nextLive = isShortCode
          ? await getLiveSessionByCode(requestedLiveId)
          : await getLiveSession(requestedLiveId);
        if (!active) return;
        setSessionId(nextLive.id);
        setLive(nextLive);
        if (nextLive.status === 'ended' || nextLive.status === 'failed') {
          setEnded(true);
          return;
        }

        let myParticipant = await getMyLiveParticipant(nextLive.id, userId);
        if ((!myParticipant || myParticipant.status !== 'joined') && nextLive.status === 'live') {
          myParticipant = await joinLiveSession(nextLive.id, userId);
        }
        if (!active) return;
        if (!myParticipant || myParticipant.status !== 'joined') {
          throw new Error('You cannot join this live room.');
        }

        setParticipant(myParticipant);
        setRole(myParticipant.role);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not open this live.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialise();
    return () => { active = false; };
  }, [requestedLiveId, userId]);

  useEffect(() => {
    if (!live || !userId || ended) return;
    void refreshParticipants();
    void refreshGuestRequests();
    void refreshMessages();

    const channel = supabase.channel(`lumo-live-session:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` }, () => {
        void refreshSession();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_participants', filter: `session_id=eq.${sessionId}` }, () => {
        void refreshParticipants();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_guest_requests', filter: `session_id=eq.${sessionId}` }, () => {
        void refreshGuestRequests();
        void refreshParticipants();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `session_id=eq.${sessionId}` }, () => {
        void refreshMessages();
      })
      .subscribe();

    const timer = setInterval(() => {
      void refreshParticipants();
      void refreshGuestRequests();
      void refreshMessages();
      void refreshSession();
    }, 12000);

    return () => {
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [live, userId, ended, sessionId, refreshParticipants, refreshGuestRequests, refreshMessages, refreshSession]);

  const sendMessageNow = async () => {
    if (!userId || !messageText.trim() || working) return;
    const text = messageText.trim();
    setMessageText('');
    try {
      await sendLiveMessage(sessionId, userId, text);
      await refreshMessages();
    } catch (cause) {
      setMessageText(text);
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.');
    }
  };

  const requestStage = async () => {
    if (!userId || working) return;
    setWorking(true);
    setError(null);
    try {
      await requestLiveStage(sessionId, userId);
      await refreshGuestRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your stage request.');
    } finally {
      setWorking(false);
    }
  };

  const cancelRequest = async () => {
    if (!myRequest || working) return;
    setWorking(true);
    try {
      const { error: cancelError } = await db
        .from('live_guest_requests')
        .update({ status: 'cancelled' })
        .eq('id', myRequest.id)
        .eq('requester_id', userId)
        .in('status', ['pending', 'accepted']);
      if (cancelError) throw cancelError;
      await refreshGuestRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel your request.');
    } finally {
      setWorking(false);
    }
  };

  const joinStage = async () => {
    if (!userId || working) return;
    setWorking(true);
    setError(null);
    try {
      await takeLiveStage(sessionId, userId);
      const nextParticipant = await getMyLiveParticipant(sessionId, userId);
      if (!nextParticipant) throw new Error('Your guest seat could not be confirmed.');
      setParticipant(nextParticipant);
      setRole('guest');
      await refreshParticipants();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join the stage.');
    } finally {
      setWorking(false);
    }
  };

  const leaveStage = async () => {
    if (!userId || working) return;
    setWorking(true);
    setError(null);
    try {
      await leaveLiveStage(sessionId, userId);
      const nextParticipant = await getMyLiveParticipant(sessionId, userId);
      setParticipant(nextParticipant);
      setRole('viewer');
      await refreshParticipants();
      await refreshGuestRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not leave the stage.');
    } finally {
      setWorking(false);
    }
  };

  const reviewRequest = async (requestId: string, status: 'accepted' | 'declined') => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      await respondToLiveStageRequest(requestId, status);
      await refreshGuestRequests();
      await refreshParticipants();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the guest request.');
    } finally {
      setWorking(false);
    }
  };

  const releaseRequest = async (requestId: string) => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      await releaseLiveGuestRequest(requestId);
      await refreshGuestRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not release this guest seat.');
    } finally {
      setWorking(false);
    }
  };

  const moderateGuest = async (targetUserId: string, action: 'mute' | 'unmute' | 'remove') => {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('livekit-moderate', {
        body: { sessionId, targetUserId, action },
      });
      if (functionError || data?.error) throw new Error(data?.error || functionError?.message || 'Moderation failed.');
      if (action === 'remove') {
        setMutedGuestIds(current => current.filter(id => id !== targetUserId));
        await refreshParticipants();
        await refreshGuestRequests();
      } else {
        setMutedGuestIds(current => action === 'mute'
          ? [...new Set([...current, targetUserId])]
          : current.filter(id => id !== targetUserId));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Moderation failed.');
    } finally {
      setWorking(false);
    }
  };

  const applyLiveBan = async (target: LiveParticipant, duration: '1_week' | '1_month' | '1_year' | 'permanent') => {
    if (!isDeveloper || !userId || target.user_id === userId || working) return;
    setWorking(true);
    setError(null);
    try {
      const { data, error: banError } = await supabase.functions.invoke('livekit-platform-ban', {
        body: { targetUserId: target.user_id, duration, reason: 'LIVE qoidalarini buzish yoki 18+ kontent' },
      });
      if (banError || data?.error || !data?.success) throw new Error(data?.error || banError?.message || 'LIVE ban qoyilmadi.');
      if (target.user_id === live?.host_id) {
        setEnded(true);
        setLive(current => current ? { ...current, status: 'ended' } : current);
      }
      await refreshParticipants();
      const durationLabel = ({ '1_week': '1 hafta', '1_month': '1 oy', '1_year': '1 yil', permanent: 'butunlay' } as const)[duration];
      Alert.alert('LIVE ban qoyildi', '@' + (target.host?.username ?? 'user') + ' uchun ' + durationLabel + ' muddatga LIVE cheklovi berildi.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'LIVE ban qoyilmadi.');
    } finally { setWorking(false); }
  };

  const openLiveBanOptions = (target: LiveParticipant) => {
    if (!isDeveloper || target.user_id === userId) return;
    Alert.alert('LIVE ban berish', '@' + (target.host?.username ?? 'user') + ' hisobining LIVE huquqini cheklash', [
      { text: '1 hafta', onPress: () => void applyLiveBan(target, '1_week') },
      { text: '1 oy', onPress: () => void applyLiveBan(target, '1_month') },
      { text: '1 yil', onPress: () => void applyLiveBan(target, '1_year') },
      { text: 'Butunlay', style: 'destructive', onPress: () => void applyLiveBan(target, 'permanent') },
      { text: 'Bekor qilish', style: 'cancel' },
    ]);
  };

  const shareLive = async () => {
    const liveCode = live?.live_code ?? sessionId;
    const liveUrl = 'https://shvmrmuhammadumar-blip.github.io/live/' + liveCode;
    const appUrl = 'lumo://live/' + liveCode;
    try {
      await Share.share({
        title: 'LUMO LIVE',
        message: `Join my LUMO LIVE room:\nOpen in LUMO: ${appUrl}\nWeb link: ${liveUrl}\n\nLIVE ID: ${liveCode}`,
        url: liveUrl,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share this live.');
    }
  };

  const finishLive = async () => {
    if (!userId || working) return;
    setWorking(true);
    setError(null);
    try {
      const { data, error: functionError } = await supabase.functions.invoke('livekit-end-session', {
        body: { sessionId },
      });
      if (functionError || data?.error) throw new Error(data?.error || functionError?.message || 'Could not end this live.');
      setEnded(true);
      router.replace('/live' as never);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not end this live. Please retry.');
    } finally {
      setWorking(false);
    }
  };

  const handleConnectionChange = useCallback((nextConnected: boolean) => {
    setConnected(nextConnected);
    if (!nextConnected || !userId || !live || !isHost || live.status !== 'starting' || hostActivationRef.current) return;

    hostActivationRef.current = true;
    void activateLiveSession(sessionId, userId, live.created_at)
      .then(() => refreshSession())
      .catch((cause) => {
        hostActivationRef.current = false;
        setError(cause instanceof Error ? cause.message : 'The live stage could not be published.');
      });
  }, [isHost, live, refreshSession, sessionId, userId]);

  if (loading) {
    return <View style={styles.fullState}><ActivityIndicator color="#C9D9A4" size="large" /><Text style={styles.stateText}>Opening the live room</Text></View>;
  }

  if (error && !live) {
    return (
      <View style={styles.fullState}>
        <Ionicons name="alert-circle-outline" size={34} color="#D8B879" />
        <Text style={styles.stateTitle}>This live is unavailable</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/live' as never)}><Text style={styles.primaryButtonText}>Back to Live</Text></Pressable>
      </View>
    );
  }

  if (!live || ended) {
    return (
      <View style={styles.fullState}>
        <Ionicons name="radio-outline" size={34} color="#C9D9A4" />
        <Text style={styles.stateTitle}>This live has ended</Text>
        <Text style={styles.stateText}>The stage is closed. Find another room or start your own.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace('/live' as never)}><Text style={styles.primaryButtonText}>Explore Live</Text></Pressable>
      </View>
    );
  }

  const acceptedReservations = requests.filter(
    item => item.status === 'accepted' && !guests.some(guest => guest.user_id === item.requester_id),
  );
  const hostRequestRows = requests.filter(
    item => item.status === 'pending' || (item.status === 'accepted' && !guests.some(guest => guest.user_id === item.requester_id)),
  );
  const pendingRequestCount = requests.filter(item => item.status === 'pending').length;
  const guestSlots = Math.max(0, 3 - guests.length - acceptedReservations.length);
  const canRequestStage = role === 'viewer' && myRequest?.status !== 'pending' && myRequest?.status !== 'accepted';
  const canJoinAcceptedStage = role === 'viewer' && myRequest?.status === 'accepted';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable style={styles.backButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={20} color="#F2F5F7" /></Pressable>
        <View style={styles.topTitle}>
          <View style={styles.livePill}><View style={[styles.liveDot, live.status === 'starting' && styles.liveDotStarting]} /><Text style={styles.livePillText}>{live.status === 'starting' ? 'PREPARING' : 'LIVE'}</Text></View>
          <Text style={styles.topLiveTitle} numberOfLines={1}>{live.title}</Text>
        </View>
        <View style={styles.viewerBadge}><Ionicons name="people-outline" size={13} color="#F2F5F7" /><Text style={styles.viewerBadgeText}>{participants.length.toLocaleString()}</Text></View>
        <Pressable style={styles.shareButton} onPress={() => void shareLive()} accessibilityRole="button" accessibilityLabel="Share live room">
          <Ionicons name="share-social-outline" size={17} color="#F2F5F7" />
        </Pressable>
      </View>

      <View style={styles.liveIdCard}>
        <View style={styles.liveIdCopy}>
          <Text style={styles.liveIdLabel}>LUMO LIVE ID</Text>
          <Text style={styles.liveIdValue} selectable>{live.live_code}</Text>
        </View>
        <Text style={styles.liveIdHint}>8-DIGIT CODE</Text>
      </View>

      <View style={styles.roomHeading}>
        <View style={styles.hostIdentity}>
          <View style={styles.hostAvatar}>
            {live.host?.avatar_url ? <Image source={{ uri: live.host.avatar_url }} style={styles.hostAvatarImage} contentFit="cover" /> : <Text style={styles.hostAvatarInitial}>{avatarInitial(displayName)}</Text>}
          </View>
          <View style={styles.hostCopy}>
            <Text style={styles.hostName}>@{displayName}</Text>
            <Text style={styles.hostCaption}>{isHost ? 'You are hosting this live' : 'Hosting this live'} · {guests.length}/3 guests</Text>
          </View>
        </View>
        <View style={styles.roomAudience}><Ionicons name={live.audience === 'public' ? 'globe-outline' : 'people-outline'} size={13} color="#AAB6C1" /><Text style={styles.roomAudienceText}>{live.audience === 'public' ? 'PUBLIC' : 'FOLLOWERS'}</Text></View>
      </View>

      {error ? <View style={styles.inlineError}><Ionicons name="alert-circle-outline" size={16} color="#D8B879" /><Text style={styles.inlineErrorText}>{error}</Text></View> : null}

      <View style={[styles.roomColumns, wideLayout && styles.roomColumnsWide]}>
        <View style={styles.stageColumn}>
          <View style={styles.videoCard}>
        <LiveRoom key={`${sessionId}-${role}`} sessionId={sessionId} onConnectionChange={handleConnectionChange} />
      </View>

      <View style={styles.sessionMeta}>
        <Text style={styles.sessionCategory}>{live.category.toUpperCase()}</Text>
        <Text style={styles.sessionDescription}>{live.description || 'Come into the conversation and be part of the moment.'}</Text>
      </View>

      {isDeveloper ? (
        <View style={styles.developerPanel}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.panelEyebrow}>DEVELOPER TOOLS</Text><Text style={styles.panelTitle}>LIVE moderation</Text></View>
            <View style={styles.developerBadge}><Text style={styles.developerBadgeText}>DEVELOPER</Text></View>
          </View>
          <Text style={styles.developerDescription}>Qoidani buzgan yoki 18+ efir qilgan foydalanuvchiga LIVE cheklovi bering.</Text>
          {participants.map(target => (
            <View key={target.user_id} style={styles.developerUserRow}>
              <View style={styles.developerUserCopy}>
                <Text style={styles.developerUserName}>@{target.host?.username ?? 'lumo_member'}</Text>
                <Text style={styles.developerUserRole}>{target.role.toUpperCase()}</Text>
              </View>
              {target.user_id === userId ? <Text style={styles.developerSelf}>YOU</Text> : (
                <Pressable style={styles.developerBanButton} onPress={() => openLiveBanOptions(target)} disabled={working}>
                  <Ionicons name="ban-outline" size={14} color="#FFE0E0" /><Text style={styles.developerBanText}>BAN</Text>
                </Pressable>
              )}
            </View>
          ))}
          {!participants.length ? <Text style={styles.developerDescription}>Hozircha qatnashchilar yoq.</Text> : null}
        </View>
      ) : null}

      {isHost ? (
        <View style={styles.hostPanel}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.panelEyebrow}>YOUR STAGE</Text><Text style={styles.panelTitle}>Guest requests <Text style={styles.panelCount}>{pendingRequestCount}</Text></Text></View>
            <View style={styles.slotsBadge}><Text style={styles.slotsText}>{guestSlots} SEATS LEFT</Text></View>
          </View>

          {hostRequestRows.length ? hostRequestRows.map(item => (
            <View key={item.id} style={styles.requestRow}>
              <View style={styles.requestAvatar}><Text style={styles.requestInitial}>{avatarInitial(item.requester?.username)}</Text></View>
              <View style={styles.requestCopy}>
                <Text style={styles.requestName}>@{item.requester?.username ?? 'lumo_member'}</Text>
                <Text style={styles.requestCaption}>{item.status === 'accepted' ? 'Approved · waiting to join' : 'Wants to join your stage · ' + ago(item.created_at)}</Text>
              </View>
              {item.status === 'pending' ? (
                <>
                  <Pressable style={styles.declineButton} onPress={() => void reviewRequest(item.id, 'declined')} disabled={working}><Ionicons name="close" size={17} color="#E6A1A1" /></Pressable>
                  <Pressable style={styles.acceptButton} onPress={() => void reviewRequest(item.id, 'accepted')} disabled={working || guestSlots <= 0}>
                    <Ionicons name="checkmark" size={17} color="#11161C" />
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.removeGuestButton} onPress={() => void releaseRequest(item.id)} disabled={working} accessibilityRole="button" accessibilityLabel="Release reserved guest seat">
                  <Ionicons name="close-circle-outline" size={18} color="#E9A1A1" />
                </Pressable>
              )}
            </View>
          )) : (
            <View style={styles.noRequests}><Ionicons name="hand-left-outline" size={20} color="#8C9A8A" /><Text style={styles.noRequestsText}>Your audience can request a seat. You decide who joins.</Text></View>
          )}

          <View style={styles.panelDivider} />
          <Text style={styles.panelEyebrow}>ON YOUR STAGE</Text>
          {guests.length ? guests.map(item => (
            <View key={item.user_id} style={styles.guestRow}>
              <View style={styles.guestAvatar}><Text style={styles.requestInitial}>{avatarInitial(item.host?.username)}</Text></View>
              <View style={styles.requestCopy}>
                <Text style={styles.requestName}>@{item.host?.username ?? 'guest'}</Text>
                <Text style={styles.requestCaption}>Guest · connected</Text>
              </View>
              <Pressable style={styles.guestAction} onPress={() => void moderateGuest(item.user_id, mutedGuestIds.includes(item.user_id) ? 'unmute' : 'mute')} disabled={working}>
                <Ionicons name={mutedGuestIds.includes(item.user_id) ? 'mic-off' : 'mic'} size={15} color="#D6E3B4" />
                <Text style={styles.guestActionText}>{mutedGuestIds.includes(item.user_id) ? 'Unmute' : 'Mute'}</Text>
              </Pressable>
              <Pressable style={styles.removeGuestButton} onPress={() => void moderateGuest(item.user_id, 'remove')} disabled={working}>
                <Ionicons name="remove-circle-outline" size={17} color="#E9A1A1" />
              </Pressable>
            </View>
          )) : <Text style={styles.emptyGuestText}>No guests on stage yet.</Text>}

          <Pressable style={styles.endButton} onPress={() => void finishLive()} disabled={working}>
            {working ? <ActivityIndicator size="small" color="#FFE0E0" /> : <Ionicons name="stop-circle-outline" size={17} color="#FFE0E0" />}
            <Text style={styles.endButtonText}>End live</Text>
          </Pressable>
        </View>
      ) : role === 'guest' ? (
        <View style={styles.guestOnStageCard}>
          <View style={styles.stageDot}><Ionicons name="mic" size={17} color="#C9D9A4" /></View>
          <View style={styles.stageCopy}><Text style={styles.stageTitle}>You are on stage</Text><Text style={styles.stageSubtitle}>Your camera and microphone are shared with the audience.</Text></View>
          <Pressable style={styles.leaveStageButton} onPress={() => void leaveStage()} disabled={working}><Text style={styles.leaveStageText}>Leave stage</Text></Pressable>
        </View>
      ) : (
        <View style={styles.viewerStageCard}>
          <View style={styles.viewerStageTop}>
            <View style={styles.stageDot}><Ionicons name="people" size={17} color="#C9D9A4" /></View>
            <View style={styles.stageCopy}><Text style={styles.stageTitle}>Join the conversation</Text><Text style={styles.stageSubtitle}>Ask the host to bring you on stage.</Text></View>
            <Text style={styles.slotCount}>{guests.length}/3</Text>
          </View>
          {canJoinAcceptedStage ? (
            <>
              <Pressable style={styles.requestStageButton} onPress={() => void joinStage()} disabled={working}>
                {working ? <ActivityIndicator color="#11161C" /> : <Ionicons name="mic" size={17} color="#11161C" />}
                <Text style={styles.requestStageButtonText}>Your request was accepted — join stage</Text>
              </Pressable>
              <View style={styles.waitingRow}>
                <Text style={styles.waitingText}>Your spot is approved.</Text>
                <Pressable onPress={() => void cancelRequest()} disabled={working}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              </View>
            </>
          ) : myRequest?.status === 'pending' ? (
            <View style={styles.waitingRow}>
              <View style={styles.waitingIndicator}><ActivityIndicator color="#C9D9A4" size="small" /></View>
              <Text style={styles.waitingText}>Request sent. Waiting for the host.</Text>
              <Pressable onPress={() => void cancelRequest()} disabled={working}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            </View>
          ) : (
            <Pressable style={styles.requestStageButton} onPress={() => void requestStage()} disabled={working || guests.length >= 3}>
              {working ? <ActivityIndicator color="#11161C" /> : <Ionicons name="hand-left" size={17} color="#11161C" />}
              <Text style={styles.requestStageButtonText}>{guests.length >= 3 ? 'Stage is full' : myRequest?.status === 'declined' ? 'Request again' : 'Request to join stage'}</Text>
            </Pressable>
          )}
        </View>
      )}
        </View>

        <View style={[styles.chatColumn, wideLayout && styles.chatColumnWide]}>
      <View style={styles.chatCard}>
        <View style={styles.panelHeader}>
          <View><Text style={styles.panelEyebrow}>THE ROOM</Text><Text style={styles.panelTitle}>Live chat <Text style={styles.panelCount}>{messages.length}</Text></Text></View>
          <View style={styles.chatOnline}><View style={styles.onlineDot} /><Text style={styles.chatOnlineText}>LIVE</Text></View>
        </View>
        <View style={styles.chatMessages}>
          {messages.length ? messages.slice(-30).map(item => (
            <View key={item.id} style={styles.messageRow}>
              <View style={styles.messageAvatar}><Text style={styles.messageInitial}>{avatarInitial(item.profile?.username)}</Text></View>
              <View style={styles.messageCopy}>
                <View style={styles.messageHeading}><Text style={styles.messageName}>@{item.profile?.username ?? 'member'}</Text><Text style={styles.messageTime}>{ago(item.created_at)}</Text></View>
                <Text style={styles.messageBody}>{item.body}</Text>
              </View>
            </View>
          )) : <Text style={styles.emptyChatText}>The conversation starts here. Say hello.</Text>}
        </View>
        <View style={styles.chatComposer}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Write a message…"
            placeholderTextColor="#6E7A89"
            style={styles.chatInput}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => void sendMessageNow()}
          />
          <Pressable style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]} onPress={() => void sendMessageNow()} disabled={!messageText.trim() || working}>
            <Ionicons name="arrow-up" size={18} color="#11161C" />
          </Pressable>
        </View>
      </View>
        </View>
      </View>

      <View style={styles.connectionFooter}>
        <View style={[styles.connectionDot, connected && styles.connectionDotActive]} />
        <Text style={styles.connectionText}>{connected ? (live.status === 'starting' ? 'Preparing your live stage' : 'Secure video connection active') : 'Connecting to the live video room'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090C12' },
  content: { paddingHorizontal: 15, paddingTop: 14, paddingBottom: 38, gap: 14, width: '100%', maxWidth: 1240, alignSelf: 'center' },
  roomColumns: { gap: 14 },
  roomColumnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  stageColumn: { flex: 1, minWidth: 0, gap: 14 },
  chatColumn: { minWidth: 0 },
  chatColumnWide: { width: 360, maxWidth: '40%' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#171D24', borderWidth: 1, borderColor: '#2B3440', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, gap: 3 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F16D73' },
  liveDotStarting: { backgroundColor: '#D8B879' },
  livePillText: { color: '#F3A8A9', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  topLiveTitle: { color: '#F2F5F7', fontSize: 13, fontWeight: '900' },
  viewerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#171D24', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  shareButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#171D24', borderWidth: 1, borderColor: '#2B3440', alignItems: 'center', justifyContent: 'center' },
  viewerBadgeText: { color: '#F2F5F7', fontSize: 9, fontWeight: '800' },
  liveIdCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, backgroundColor: '#111920', borderWidth: 1, borderColor: '#2B3940' },
  liveIdCopy: { flex: 1, minWidth: 0, gap: 4 },
  liveIdLabel: { color: '#91A076', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  liveIdValue: { color: '#E7EDF1', fontSize: 10, fontWeight: '700', letterSpacing: 0.35, fontVariant: ['tabular-nums'] },
  liveIdHint: { color: '#91A076', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  roomHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hostIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  hostAvatar: { width: 38, height: 38, borderRadius: 14, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hostAvatarImage: { width: '100%', height: '100%' },
  hostAvatarInitial: { color: '#11161C', fontSize: 14, fontWeight: '900' },
  hostCopy: { flex: 1, gap: 2 },
  hostName: { color: '#F2F5F7', fontSize: 11, fontWeight: '900' },
  hostCaption: { color: '#8E9AA7', fontSize: 9 },
  roomAudience: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  roomAudienceText: { color: '#AAB6C1', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#211B16', borderColor: '#51432F', borderWidth: 1, borderRadius: 12, padding: 10 },
  inlineErrorText: { color: '#E0C89E', fontSize: 10, flex: 1, lineHeight: 15 },
  videoCard: { borderRadius: 20, backgroundColor: '#10151B', borderWidth: 1, borderColor: '#2B3440', padding: 10, gap: 12 },
  sessionMeta: { gap: 4, paddingHorizontal: 2 },
  sessionCategory: { color: '#C3D19E', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  sessionDescription: { color: '#AEB8C3', fontSize: 11, lineHeight: 16 },
  developerPanel: { backgroundColor: '#191417', borderWidth: 1, borderColor: '#694148', borderRadius: 16, padding: 13, gap: 11 },
  developerBadge: { backgroundColor: '#3A2428', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  developerBadgeText: { color: '#F0B4B4', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  developerDescription: { color: '#B8A4A5', fontSize: 9, lineHeight: 14 },
  developerUserRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#211A1D', borderRadius: 11, padding: 9 },
  developerUserCopy: { flex: 1, gap: 3 },
  developerUserName: { color: '#F2F5F7', fontSize: 10, fontWeight: '900' },
  developerUserRole: { color: '#8F7F82', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  developerSelf: { color: '#91A076', fontSize: 8, fontWeight: '900' },
  developerBanButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#5A2D34', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  developerBanText: { color: '#FFE0E0', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  hostPanel: { backgroundColor: '#11171E', borderWidth: 1, borderColor: '#2B3440', borderRadius: 18, padding: 13, gap: 11 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  panelEyebrow: { color: '#7F8B99', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  panelTitle: { color: '#F2F5F7', fontSize: 14, fontWeight: '900', marginTop: 3 },
  panelCount: { color: '#91A076', fontSize: 11 },
  slotsBadge: { backgroundColor: '#202A27', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999 },
  slotsText: { color: '#D1DEB4', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#171D24', borderRadius: 13, padding: 9 },
  requestAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#29332F', alignItems: 'center', justifyContent: 'center' },
  requestInitial: { color: '#D6E3B4', fontSize: 11, fontWeight: '900' },
  requestCopy: { flex: 1, gap: 3 },
  requestName: { color: '#F2F5F7', fontSize: 10, fontWeight: '900' },
  requestCaption: { color: '#84919E', fontSize: 8 },
  declineButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#382528' },
  acceptButton: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C9D9A4' },
  noRequests: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#171D24', borderRadius: 13, padding: 12 },
  noRequestsText: { color: '#AAB6C1', fontSize: 9, flex: 1, lineHeight: 14 },
  panelDivider: { height: 1, backgroundColor: '#2B3440', marginVertical: 2 },
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guestAvatar: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#29332F', alignItems: 'center', justifyContent: 'center' },
  guestAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: '#202A27', borderRadius: 9 },
  guestActionText: { color: '#D6E3B4', fontSize: 8, fontWeight: '900' },
  removeGuestButton: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#382528', borderRadius: 9 },
  emptyGuestText: { color: '#758291', fontSize: 9 },
  endButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#3A2428', borderWidth: 1, borderColor: '#704148', padding: 11, borderRadius: 12, marginTop: 2 },
  endButtonText: { color: '#FFE0E0', fontSize: 10, fontWeight: '900' },
  guestOnStageCard: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 15, backgroundColor: '#171F1E', borderWidth: 1, borderColor: '#344039' },
  stageDot: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#27332B', alignItems: 'center', justifyContent: 'center' },
  stageCopy: { flex: 1, gap: 3 },
  stageTitle: { color: '#E9EEDC', fontSize: 11, fontWeight: '900' },
  stageSubtitle: { color: '#9DAD9B', fontSize: 9, lineHeight: 14 },
  leaveStageButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#28312D' },
  leaveStageText: { color: '#D6E3B4', fontSize: 9, fontWeight: '900' },
  viewerStageCard: { backgroundColor: '#11171E', borderWidth: 1, borderColor: '#344039', borderRadius: 16, padding: 12, gap: 12 },
  viewerStageTop: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  slotCount: { color: '#C9D9A4', fontSize: 10, fontWeight: '900' },
  requestStageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#C9D9A4' },
  requestStageButtonText: { color: '#11161C', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: '#1A2423', borderWidth: 1, borderColor: '#344039', padding: 10 },
  waitingIndicator: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' },
  waitingText: { flex: 1, color: '#C5D0BD', fontSize: 9, fontWeight: '700' },
  cancelText: { color: '#E9A1A1', fontSize: 9, fontWeight: '900' },
  chatCard: { backgroundColor: '#11171E', borderRadius: 17, borderWidth: 1, borderColor: '#2B3440', padding: 12, gap: 10 },
  chatOnline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#9BC38D' },
  chatOnlineText: { color: '#9BC38D', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  chatMessages: { minHeight: 72, maxHeight: 250, gap: 10 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  messageAvatar: { width: 25, height: 25, borderRadius: 9, backgroundColor: '#27332D', alignItems: 'center', justifyContent: 'center' },
  messageInitial: { color: '#D6E3B4', fontSize: 9, fontWeight: '900' },
  messageCopy: { flex: 1, gap: 3 },
  messageHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  messageName: { color: '#BAC99A', fontSize: 9, fontWeight: '900' },
  messageTime: { color: '#667382', fontSize: 8 },
  messageBody: { color: '#DCE2E7', fontSize: 10, lineHeight: 15 },
  emptyChatText: { color: '#7B8794', fontSize: 9, paddingVertical: 15, textAlign: 'center' },
  chatComposer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatInput: { flex: 1, minHeight: 39, maxHeight: 90, borderRadius: 12, backgroundColor: '#1A2129', borderWidth: 1, borderColor: '#303A45', color: '#F2F5F7', fontSize: 10, paddingHorizontal: 11, paddingVertical: 9 },
  sendButton: { width: 37, height: 37, borderRadius: 12, backgroundColor: '#C9D9A4', alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
  connectionFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 6 },
  connectionDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#D8B879' },
  connectionDotActive: { backgroundColor: '#9BC38D' },
  connectionText: { color: '#74808D', fontSize: 8 },
  fullState: { flex: 1, minHeight: 420, backgroundColor: '#090C12', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  stateTitle: { color: '#F2F5F7', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  stateText: { color: '#9AA5B2', fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 320 },
  primaryButton: { backgroundColor: '#C9D9A4', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, marginTop: 5 },
  primaryButtonText: { color: '#11161C', fontSize: 10, fontWeight: '900' },
});
