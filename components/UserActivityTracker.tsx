import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

const db = supabase as any;

function makeSessionKey(userId: string) {
  return `lumo-session-${userId.slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function UserActivityTracker() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let sessionKey: string | null = null;
    let startedAt = 0;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let writeQueue: Promise<void> = Promise.resolve();

    const persist = (key: string, started: number, ended: boolean) => {
      writeQueue = writeQueue
        .then(async () => {
          const now = Date.now();
          const { error } = await db.from('user_activity_sessions').upsert({
            user_id: userId,
            session_key: key,
            started_at: new Date(started).toISOString(),
            last_seen_at: new Date(now).toISOString(),
            ended_at: ended ? new Date(now).toISOString() : null,
            duration_ms: Math.max(0, now - started),
            platform: Platform.OS,
          }, { onConflict: 'user_id,session_key' });

          if (error) {
            console.warn('[Lumo activity] session save failed:', error.message);
          }
        })
        .catch((error) => {
          console.warn('[Lumo activity] session save failed:', error);
        });

      return writeQueue;
    };

    const stop = () => {
      if (!sessionKey) return;
      const key = sessionKey;
      const started = startedAt;
      sessionKey = null;
      startedAt = 0;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      void persist(key, started, true);
    };

    const start = () => {
      if (sessionKey) return;
      sessionKey = makeSessionKey(userId);
      startedAt = Date.now();
      void persist(sessionKey, startedAt, false);
      heartbeat = setInterval(() => {
        if (sessionKey) void persist(sessionKey, startedAt, false);
      }, 15000);
    };

    const syncActiveState = () => {
      const visible = Platform.OS !== 'web' ||
        typeof document === 'undefined' ||
        document.visibilityState !== 'hidden';
      if (AppState.currentState === 'active' && visible) start();
      else stop();
    };

    syncActiveState();
    const appStateSubscription = AppState.addEventListener('change', syncActiveState);

    let onVisibilityChange: (() => void) | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisibilityChange = syncActiveState;
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      appStateSubscription.remove();
      if (onVisibilityChange && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      stop();
    };
  }, [userId]);

  return null;
}
