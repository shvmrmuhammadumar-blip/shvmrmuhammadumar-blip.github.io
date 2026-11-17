
import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && key);

const nativeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

let refreshInFlight: Promise<string | null> | null = null;

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

async function isExpiredJwtResponse(
  response: Response,
): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  try {
    const body = await response.clone().text();

    return (
      /PGRST301/i.test(body) ||
      /JWT\s+expired/i.test(body) ||
      /expired\s+JWT/i.test(body) ||
      /token\s+is\s+expired/i.test(body)
    );
  } catch {
    return false;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();

        if (error || !data.session?.access_token) {
          return null;
        }

        return data.session.access_token;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

const fetchWithAuthRecovery: typeof fetch = async (input, init) => {
  const requestMethod = (
    init?.method ?? (isRequest(input) ? input.method : 'GET')
  ).toUpperCase();

  const response = await nativeFetch(input, init);

  // Only retry safe read operations. Never repeat a message insert,
  // upload, delete or other write operation automatically.
  if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
    return response;
  }

  if (!(await isExpiredJwtResponse(response))) {
    return response;
  }

  const accessToken = await refreshAccessToken();

  if (!accessToken) {
    return response;
  }

  const headers = new Headers(
    isRequest(input) ? input.headers : undefined,
  );

  if (init?.headers) {
    new Headers(init.headers).forEach((value, name) => {
      headers.set(name, value);
    });
  }

  headers.set('Authorization', `Bearer ${accessToken}`);

  const retryInit: RequestInit = {
    ...init,
    method: requestMethod,
    headers,
  };

  if (isRequest(input)) {
    return nativeFetch(input.clone(), retryInit);
  }

  return nativeFetch(input, retryInit);
};

export const supabase = createClient<Database>(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithAuthRecovery,
    },
  },
);

// Keep Supabase token refresh active while the native app is foregrounded.
if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') {
    void supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
