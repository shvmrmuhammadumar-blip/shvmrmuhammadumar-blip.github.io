import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { rememberAccount } from './saved-accounts';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, username: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (active) setSession(next);
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && next?.user.email) {
        void rememberAccount(next.user.id, next.user.email).catch(() => undefined);
      }
    });

    const restoreSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (active) setSession(data.session);
      } catch {
        // A temporary network/configuration failure must not trap the user
        // behind the splash loader. The login screen can explain setup issues.
        if (active) setSession(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void restoreSession();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      return error ? error.message : null;
    },
    signUp: async (email, password, username) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { username: username.trim().toLowerCase() } },
      });
      if (error) return error.message;
      if (!data.session) return 'Check your email to confirm your account, then log in.';
      return null;
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
