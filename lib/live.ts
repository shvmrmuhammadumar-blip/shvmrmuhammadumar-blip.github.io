import { supabase } from './supabase';

const db = supabase as any;

export const LIVE_CATEGORIES = [
  { key: 'conversation', label: 'Conversation' },
  { key: 'music', label: 'Music' },
  { key: 'creative', label: 'Creative' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'education', label: 'Education' },
  { key: 'other', label: 'Other' },
] as const;

export type LiveCategory = (typeof LIVE_CATEGORIES)[number]['key'];
export type LiveAudience = 'public' | 'followers';
export type LiveRole = 'host' | 'guest' | 'viewer';

export type LiveHost = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type LiveSession = {
  id: string;
  live_code: string;
  host_id: string;
  title: string;
  description: string;
  category: LiveCategory;
  audience: LiveAudience;
  status: 'starting' | 'live' | 'ended' | 'failed';
  room_name: string;
  cover_url: string | null;
  started_at: string | null;
  created_at: string;
  host: LiveHost | null;
};

export type LiveParticipant = {
  id: string;
  session_id: string;
  user_id: string;
  role: LiveRole;
  status: 'joined' | 'left' | 'removed';
  joined_at: string;
  host: LiveHost | null;
};

export type LiveGuestRequest = {
  id: string;
  session_id: string;
  requester_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  requester: LiveHost | null;
};

export type LiveMessage = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profile: Pick<LiveHost, 'id' | 'username' | 'avatar_url'> | null;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function listLiveSessions(category?: LiveCategory | 'all') {
  let query = db
    .from('live_sessions')
    .select('id, live_code, host_id, title, description, category, audience, status, room_name, cover_url, started_at, created_at, host:profiles!live_sessions_host_id_fkey(id, username, avatar_url)')
    .eq('status', 'live')
    .order('started_at', { ascending: false })
    .limit(30);

  if (category && category !== 'all') query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;

  const sessions = (data ?? []) as LiveSession[];
  const counts = await Promise.all(sessions.map(async (session) => {
    const { count, error: countError } = await db
      .from('live_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('status', 'joined');
    return { id: session.id, count: countError ? 0 : count ?? 0 };
  }));

  const countById = new Map(counts.map((item) => [item.id, item.count]));
  return sessions.map((session) => ({
    ...session,
    participant_count: countById.get(session.id) ?? 0,
  }));
}

export async function getLiveSession(sessionId: string) {
  const { data, error } = await db
    .from('live_sessions')
    .select('id, live_code, host_id, title, description, category, audience, status, room_name, cover_url, started_at, created_at, host:profiles!live_sessions_host_id_fkey(id, username, avatar_url)')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('This live is no longer available.');
  return data as LiveSession;
}

export async function getLiveSessionByCode(liveCode: string) {
  const { data, error } = await db
    .from('live_sessions')
    .select('id, live_code, host_id, title, description, category, audience, status, room_name, cover_url, started_at, created_at, host:profiles!live_sessions_host_id_fkey(id, username, avatar_url)')
    .eq('live_code', liveCode)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('No live room matches this LIVE ID.');
  return data as LiveSession;
}

export async function getMyLiveParticipant(sessionId: string, userId: string) {
  const { data, error } = await db
    .from('live_participants')
    .select('id, session_id, user_id, role, status, joined_at')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as LiveParticipant | null;
}

export async function joinLiveSession(sessionId: string, userId: string) {
  const existing = await getMyLiveParticipant(sessionId, userId);
  if (existing?.status === 'joined') return existing;

  if (existing) {
    const { error: removeError } = await db
      .from('live_participants')
      .delete()
      .eq('id', existing.id);
    if (removeError) throw removeError;
  }

  const { data, error } = await db
    .from('live_participants')
    .insert({ session_id: sessionId, user_id: userId, role: 'viewer', status: 'joined' })
    .select('id, session_id, user_id, role, status, joined_at')
    .single();

  if (error) throw error;
  return data as LiveParticipant;
}

const LIVE_STARTING_STALE_AFTER_MS = 2 * 60 * 1000;

async function findActiveLiveSession(hostId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LIVE_STARTING_STALE_AFTER_MS).toISOString();

  const { error: staleError } = await db
    .from('live_sessions')
    .update({ status: 'failed', ended_at: now.toISOString() })
    .eq('host_id', hostId)
    .eq('status', 'starting')
    .lt('created_at', staleBefore);

  if (staleError) throw staleError;

  const { data, error } = await db
    .from('live_sessions')
    .select('id, live_code, host_id, title, description, category, audience, status, room_name, cover_url, started_at, created_at')
    .eq('host_id', hostId)
    .in('status', ['starting', 'live'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as LiveSession | null;
}

export async function createLiveSession(input: {
  userId: string;
  title: string;
  description: string;
  category: LiveCategory;
  audience: LiveAudience;
}) {
  const activeSession = await findActiveLiveSession(input.userId);
  if (activeSession) return activeSession;

  const { data: session, error: createError } = await db
    .from('live_sessions')
    .insert({
      host_id: input.userId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      audience: input.audience,
      status: 'starting',
    })
    .select('id, live_code, host_id, title, description, category, audience, status, room_name, cover_url, started_at, created_at')
    .single();

  if (createError) {
    if (createError.code === '23505') {
      const racedSession = await findActiveLiveSession(input.userId);
      if (racedSession) return racedSession;
    }
    throw createError;
  }

  const { error: participantError } = await db
    .from('live_participants')
    .insert({ session_id: session.id, user_id: input.userId, role: 'host', status: 'joined' });

  if (participantError) {
    await db.from('live_sessions')
      .update({ status: 'failed', ended_at: new Date().toISOString() })
      .eq('id', session.id);
    throw participantError;
  }

  const { error: tokenError, data: tokenData } = await supabase.functions.invoke(
    'livekit-room-token',
    { body: { sessionId: session.id } },
  );

  if (tokenError || !tokenData?.token) {
    await db.from('live_sessions')
      .update({ status: 'failed', ended_at: new Date().toISOString() })
      .eq('id', session.id);
    await db.from('live_participants')
      .delete()
      .eq('session_id', session.id)
      .eq('user_id', input.userId);
    const providerMessage = (tokenData as { error?: string } | null)?.error;
    throw new Error(providerMessage || errorMessage(tokenError, 'LUMO LIVE could not connect to its video service.'));
  }

  // Keep the session in "starting" until the host's media connection is ready.
  // The room-token check above validates configuration; it does not prove a live stream exists.
  return session as LiveSession;
}

export async function activateLiveSession(sessionId: string, userId: string, createdAt: string) {
  const { data, error } = await db
    .from('live_sessions')
    .update({ status: 'live', started_at: createdAt })
    .eq('id', sessionId)
    .eq('host_id', userId)
    .eq('status', 'starting')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (data) return;

  const { data: current, error: readError } = await db
    .from('live_sessions')
    .select('status')
    .eq('id', sessionId)
    .eq('host_id', userId)
    .maybeSingle();

  if (readError) throw readError;
  if (current?.status !== 'live') {
    throw new Error('The live room connected, but its stage could not be published.');
  }
}

export async function getLiveConnectionToken(sessionId: string) {
  const { data, error } = await supabase.functions.invoke('livekit-room-token', {
    body: { sessionId },
  });

  if (error || !data?.token || !data?.url) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || errorMessage(error, 'Could not connect to LUMO LIVE.'));
  }

  return data as { url: string; token: string; role: LiveRole };
}

export async function loadLiveParticipants(sessionId: string) {
  const { data, error } = await db
    .from('live_participants')
    .select('id, session_id, user_id, role, status, joined_at, host:profiles!live_participants_user_id_fkey(id, username, avatar_url)')
    .eq('session_id', sessionId)
    .eq('status', 'joined')
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LiveParticipant[];
}

export async function loadGuestRequests(sessionId: string) {
  const { data, error } = await db
    .from('live_guest_requests')
    .select('id, session_id, requester_id, status, created_at, requester:profiles!live_guest_requests_requester_id_fkey(id, username, avatar_url)')
    .eq('session_id', sessionId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as LiveGuestRequest[];
}

export async function requestLiveStage(sessionId: string, userId: string) {
  const { data, error } = await db
    .from('live_guest_requests')
    .insert({ session_id: sessionId, requester_id: userId, status: 'pending' })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Your stage request is already waiting for the host.');
    throw error;
  }
  return data.id as string;
}

export async function respondToLiveStageRequest(requestId: string, status: 'accepted' | 'declined') {
  const { error } = await db
    .from('live_guest_requests')
    .update({ status })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function releaseLiveGuestRequest(requestId: string) {
  const { data, error } = await db
    .from('live_guest_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)
    .eq('status', 'accepted')
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('This reserved stage seat is no longer active.');
}

export async function takeLiveStage(sessionId: string, userId: string) {
  const { error } = await db
    .from('live_participants')
    .update({ role: 'guest' })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('role', 'viewer')
    .eq('status', 'joined');

  if (error) throw error;
}

export async function leaveLiveStage(sessionId: string, userId: string) {
  const { error: requestError } = await db
    .from('live_guest_requests')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('requester_id', userId)
    .eq('status', 'accepted');
  if (requestError) throw requestError;

  const { error } = await db
    .from('live_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  if (error) throw error;

  await joinLiveSession(sessionId, userId);
}

export async function leaveLiveRoom(sessionId: string, userId: string) {
  const { error: requestError } = await db
    .from('live_guest_requests')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('requester_id', userId)
    .in('status', ['pending', 'accepted']);
  if (requestError) throw requestError;

  const { error: participantError } = await db
    .from('live_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  if (participantError) throw participantError;
}

export async function removeLiveGuest(sessionId: string, userId: string) {
  const { error: requestError } = await db
    .from('live_guest_requests')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('requester_id', userId)
    .eq('status', 'accepted');
  if (requestError) throw requestError;

  const { error } = await db
    .from('live_participants')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('role', 'guest');
  if (error) throw error;
}

export async function endLiveSession(sessionId: string, userId: string) {
  const { error } = await db
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('host_id', userId)
    .in('status', ['starting', 'live']);

  if (error) throw error;
}

export async function loadLiveMessages(sessionId: string) {
  const { data, error } = await db
    .from('live_chat_messages')
    .select('id, session_id, user_id, body, created_at, profile:profiles!live_chat_messages_user_id_fkey(id, username, avatar_url)')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(60);

  if (error) throw error;
  return ((data ?? []) as LiveMessage[]).reverse();
}

export async function sendLiveMessage(sessionId: string, userId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 500) throw new Error('A live message must be between 1 and 500 characters.');

  const { error } = await db
    .from('live_chat_messages')
    .insert({ session_id: sessionId, user_id: userId, body: text });
  if (error) throw error;
}
