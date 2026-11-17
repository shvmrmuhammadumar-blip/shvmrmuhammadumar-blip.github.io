import { supabase } from './supabase';

export type ContentType = 'post' | 'story';

export function createContentSessionKey() {
  return `lumo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function trackContentOpen(input: {
  ownerId: string;
  viewerId: string;
  contentId: string;
  contentType: ContentType;
  sessionKey?: string;
}) {
  const { ownerId, viewerId, contentId, contentType } = input;
  if (!ownerId || !viewerId || !contentId || ownerId === viewerId) return false;
  const sessionKey = input.sessionKey ?? createContentSessionKey();

  try {
    const { error } = await supabase.from('creator_content_events').insert({
      owner_id: ownerId,
      viewer_id: viewerId,
      content_type: contentType,
      content_id: contentId,
      session_key: sessionKey,
      event_type: 'open',
      watch_ms: 0,
      content_duration_ms: 0,
    });
    return !error || error.code === '23505';
  } catch {
    return false;
  }
}

export async function trackContentPlayback(input: {
  ownerId: string;
  viewerId: string;
  contentId: string;
  contentType?: ContentType;
  sessionKey: string;
  watchMs: number;
  durationMs: number;
  completed?: boolean;
}): Promise<boolean> {
  const {
    ownerId,
    viewerId,
    contentId,
    contentType = 'post',
    sessionKey,
    watchMs,
    durationMs,
    completed = false,
  } = input;

  if (!ownerId || !viewerId || !contentId || !sessionKey || ownerId === viewerId || watchMs <= 0) return false;

  try {
    const { error } = await supabase.from('creator_content_events').upsert({
      owner_id: ownerId,
      viewer_id: viewerId,
      content_type: contentType,
      content_id: contentId,
      session_key: sessionKey,
      event_type: completed ? 'complete' : 'open',
      watch_ms: Math.min(3_600_000, Math.max(0, Math.round(watchMs))),
      content_duration_ms: Math.min(3_600_000, Math.max(0, Math.round(durationMs))),
    }, {
      onConflict: 'viewer_id,content_type,content_id,session_key',
    });

    if (error) {
      console.warn('[LUMO analytics] Could not save video watch time:', {
        code: error.code,
        message: error.message,
        contentId,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[LUMO analytics] Video watch-time request failed:', error);
    return false;
  }
}
