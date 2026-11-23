import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import {
  DEFAULT_THEME,
  themePalettes,
  type ThemeId,
  type AppColors,
  setActiveTheme,
} from './theme';

export type Locale = 'uz' | 'en' | 'ru';

type StoredPreferences = {
  theme: ThemeId;
  locale: Locale;
};

type PreferencesContextValue = StoredPreferences & {
  palette: AppColors;
  ready: boolean;
  setTheme: (theme: ThemeId) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
};

const STORAGE_PREFIX = '@lumo/preferences/v1/';
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function detectDeviceLocale(): Locale {
  try {
    const language = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (language.startsWith('ru')) return 'ru';
    if (language.startsWith('en')) return 'en';
  } catch {
    // Fall back to Uzbek for the initial LUMO audience.
  }
  return 'uz';
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(themePalettes, value);
}

function isLocale(value: unknown): value is Locale {
  return value === 'uz' || value === 'en' || value === 'ru';
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userKey = session?.user.id ?? 'device';
  const storageKey = STORAGE_PREFIX + userKey;
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  setActiveTheme(theme);
  const [locale, setLocaleState] = useState<Locale>(detectDeviceLocale);
  const [ready, setReady] = useState(false);
  const currentRef = useRef<StoredPreferences>({
    theme: DEFAULT_THEME,
    locale: detectDeviceLocale(),
  });

  useEffect(() => {
    let active = true;
    setReady(false);

    const restore = async () => {
      try {
        const stored = await AsyncStorage.getItem(storageKey);
        const parsed: unknown = stored ? JSON.parse(stored) : null;
        const value =
          typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};

        const next: StoredPreferences = {
          theme: isThemeId(value.theme) ? value.theme : DEFAULT_THEME,
          locale: isLocale(value.locale) ? value.locale : detectDeviceLocale(),
        };

        if (!active) return;
        currentRef.current = next;
        setActiveTheme(next.theme);
        setThemeState(next.theme);
        setLocaleState(next.locale);
      } catch {
        if (!active) return;
        const fallback = { theme: DEFAULT_THEME, locale: detectDeviceLocale() };
        currentRef.current = fallback;
        setActiveTheme(fallback.theme);
        setThemeState(fallback.theme);
        setLocaleState(fallback.locale);
      } finally {
        if (active) setReady(true);
      }
    };

    void restore();
    return () => {
      active = false;
    };
  }, [storageKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const palette = themePalettes[theme];
    const root = document.documentElement;
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    root.style.setProperty('--lumo-bg', palette.bg);
    root.style.setProperty('--lumo-surface', palette.surface);
    root.style.setProperty('--lumo-border', palette.border);
    root.style.setProperty('--lumo-focus', palette.focus);
    if (document.body) document.body.style.backgroundColor = palette.bg;
  }, [theme]);

  const update = useCallback(
    async (patch: Partial<StoredPreferences>) => {
      const next = { ...currentRef.current, ...patch };
      await AsyncStorage.setItem(storageKey, JSON.stringify(next));
      currentRef.current = next;
      setActiveTheme(next.theme);
      setThemeState(next.theme);
      setLocaleState(next.locale);
    },
    [storageKey],
  );

  const setTheme = useCallback((next: ThemeId) => update({ theme: next }), [update]);
  const setLocale = useCallback((next: Locale) => update({ locale: next }), [update]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      theme,
      locale,
      palette: themePalettes[theme],
      ready,
      setTheme,
      setLocale,
    }),
    [theme, locale, ready, setTheme, setLocale],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}
