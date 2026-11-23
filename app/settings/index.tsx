import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { colors, themeOptions } from '../../lib/theme';
import { usePreferences } from '../../lib/preferences';
import { t } from '../../lib/localization';
import { settingsSections } from '../../lib/settingsCatalog';
import { supabase } from '../../lib/supabase';
import { useThemedStyles } from "../../lib/theme-styles";

export default function SettingsHome() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const { locale, theme, palette } = usePreferences();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    return settingsSections.flatMap((section) =>
      section.items
        .filter((item) =>
          `${section.title} ${section.description} ${item.title} ${item.description} ${item.keywords ?? ''}`
            .toLowerCase()
            .includes(term),
        )
        .map((item) => ({ ...item, section })),
    );
  }, [query]);

  const logout = () => {
    Alert.alert('Log out of Lumo?', 'You can sign in again at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => void performLogout(),
      },
    ]);
  };

  const performLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : 'Please try again.';
      Alert.alert('Could not log out', message);
    } finally {
      setSigningOut(false);
    }
  };

  const accountEmail = session?.user.email ?? 'Email unavailable';
  const emailVerified = !!session?.user.email_confirmed_at;

  return (
    <View style={[lumoStyles.screen, { backgroundColor: palette.bg }]}>
      <Stack.Screen options={{ title: t(locale, 'Settings'), headerShown: true, headerStyle: { backgroundColor: palette.bg }, headerTintColor: palette.text, headerTitleStyle: { color: palette.text, fontWeight: '700' } }} />
      <FlatList
        data={query.trim() ? [] : settingsSections.filter((section) => section.id !== 'appearance' && section.id !== 'language')}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[lumoStyles.content, { paddingHorizontal: 12 }]}
        ListHeaderComponent={
          <View>
            <Text style={[lumoStyles.kicker, { color: palette.accent }]}>{t(locale, 'Settings').toUpperCase()}</Text>
            <Text style={[lumoStyles.title, { color: palette.text }]}>{t(locale, 'Settings')}</Text>

            <View style={[lumoStyles.accountCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Image
                source={require('../../assets/lumo-mark.png')}
                style={lumoStyles.accountLogo}
                contentFit="contain"
              />
              <View style={lumoStyles.accountCopy}>
                <Text style={[lumoStyles.accountName, { color: palette.text }]} numberOfLines={1}>
                  {accountEmail}
                </Text>
                <Text style={[lumoStyles.accountStatus, { color: palette.muted }]}>
                  {emailVerified ? 'EMAIL VERIFIED' : 'EMAIL NOT VERIFIED'}
                </Text>
              </View>
              <Text style={lumoStyles.statusMark}>{emailVerified ? '✓' : '!'}</Text>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t(locale, 'Search settings')}
              placeholderTextColor={palette.muted}
              style={[lumoStyles.search, { backgroundColor: palette.surfaceRaised, borderColor: palette.border, color: palette.text }]}
              accessibilityLabel={t(locale, 'Search settings')}
              returnKeyType="search"
            />

            {!query.trim() ? (
              <View style={lumoStyles.preferenceShortcuts}>
                <Pressable
                  onPress={() => router.push('/settings/language')}
                  style={[lumoStyles.preferenceShortcut, { backgroundColor: palette.surface, borderColor: palette.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={t(locale, 'Language')}
                >
                  <Ionicons name="language-outline" size={17} color={palette.accent} />
                  <View style={lumoStyles.preferenceShortcutCopy}>
                    <Text numberOfLines={1} style={[lumoStyles.preferenceShortcutTitle, { color: palette.text }]}>{t(locale, 'Language')}</Text>
                    <Text numberOfLines={1} style={[lumoStyles.preferenceShortcutValue, { color: palette.muted }]}>{locale === 'uz' ? 'O‘zbekcha' : locale === 'ru' ? 'Русский' : 'English'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={palette.muted} />
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/appearance')}
                  style={[lumoStyles.preferenceShortcut, { backgroundColor: palette.surface, borderColor: palette.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={t(locale, 'Appearance')}
                >
                  <Ionicons name="color-palette-outline" size={17} color={palette.accent} />
                  <View style={lumoStyles.preferenceShortcutCopy}>
                    <Text numberOfLines={1} style={[lumoStyles.preferenceShortcutTitle, { color: palette.text }]}>{t(locale, 'Appearance')}</Text>
                    <Text numberOfLines={1} style={[lumoStyles.preferenceShortcutValue, { color: palette.muted }]}>{t(locale, themeOptions.find((option) => option.id === theme)?.label ?? 'Obsidian')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={palette.muted} />
                </Pressable>
              </View>
            ) : null}

            {query.trim() ? (
              <View style={lumoStyles.results}>
                <Text style={lumoStyles.sectionLabel}>
                  {searchResults.length ? 'MATCHING SETTINGS' : 'NO MATCHES'}
                </Text>
                {searchResults.map((result) => (
                  <SettingsRow
                    key={`${result.section.id}-${result.title}`}
                    title={t(locale, result.title)}
                    description={result.description}
                    available={result.available}
                    onPress={() => router.push(`/settings/${result.section.id}`)}
                  />
                ))}
              </View>
            ) : (
              <>
              <View style={lumoStyles.shortcuts}>
                <Pressable
                  onPress={() => router.push('/edit-profile')}
                  style={lumoStyles.shortcut}
                  accessibilityRole="button"
                >
                  <Text style={lumoStyles.shortcutMark}>↗</Text>
                  <Text style={lumoStyles.shortcutLabel}>{t(locale, 'Change profile')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/security')}
                  style={lumoStyles.shortcut}
                  accessibilityRole="button"
                >
                  <Text style={lumoStyles.shortcutMark}>⌑</Text>
                  <Text style={lumoStyles.shortcutLabel}>{t(locale, 'Security')}</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => router.push('/switch-profile')}
                style={lumoStyles.switchAccountCard}
                accessibilityRole="button"
              >
                <View style={lumoStyles.switchAccountIcon}>
                  <Text style={lumoStyles.switchAccountIconText}>⇄</Text>
                </View>
                <View style={lumoStyles.switchAccountCopy}>
                  <Text style={lumoStyles.switchAccountTitle}>{t(locale, 'Switch profile')}</Text>
                  <Text style={lumoStyles.switchAccountDescription}>Move between Lumo accounts on this device</Text>
                </View>
                <Text style={lumoStyles.switchAccountChevron}>›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings/activity')}
                style={lumoStyles.activityCard}
                accessibilityRole="button"
              >
                <View style={lumoStyles.activityIcon}>
                  <Ionicons name="time-outline" size={19} color={colors.lime} />
                </View>
                <View style={lumoStyles.activityCopy}>
                  <Text style={lumoStyles.activityTitle}>{t(locale, 'Your activity')}</Text>
                  <Text style={lumoStyles.activityDescription}>Review your likes, comments, forwards, Reels and time in Lumo</Text>
                </View>
                <Text style={lumoStyles.switchAccountChevron}>›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/wallet?section=premium' as never)}
                style={lumoStyles.premiumCard}
                accessibilityRole="button"
                accessibilityLabel="LUMO Premium membership"
              >
                <View style={lumoStyles.premiumIcon}>
                  <Ionicons name="diamond-outline" size={19} color={colors.lime} />
                </View>
                <View style={lumoStyles.premiumCopy}>
                  <Text style={lumoStyles.premiumTitle}>{t(locale, 'LUMO Premium')}</Text>
                  <Text style={lumoStyles.premiumDescription}>Membership and your verified profile badge</Text>
                </View>
                <Text style={lumoStyles.switchAccountChevron}>›</Text>
              </Pressable>
              </>
            )}

            {!query.trim() && <Text style={[lumoStyles.sectionLabel, { color: palette.muted }]}>{t(locale, 'All settings').toUpperCase()}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[lumoStyles.category, { backgroundColor: palette.surface, borderColor: palette.border }]}
            onPress={() => router.push(`/settings/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.description}`}
          >
            <View style={lumoStyles.categoryCopy}>
              <Text style={[lumoStyles.categoryTitle, { color: palette.text }]}>{t(locale, item.title)}</Text>
              <Text style={[lumoStyles.categoryDescription, { color: palette.muted }]}>{item.description}</Text>
            </View>
            <Text style={lumoStyles.chevron}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={
          query.trim() ? undefined : (
            <View style={lumoStyles.footer}>
              <Pressable
                onPress={logout}
                disabled={signingOut}
                style={lumoStyles.logoutButton}
                accessibilityRole="button"
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.like} size="small" />
                ) : (
                  <Text style={lumoStyles.logoutText}>{t(locale, 'Log out')}</Text>
                )}
              </Pressable>
              <Text style={lumoStyles.footerNote}>
                Account deletion and other unavailable controls are not
                performed from this screen.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

function SettingsRow({
  title,
  description,
  available,
  onPress,
}: {
  title: string;
  description: string;
  available?: boolean;
  onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <Pressable
      style={lumoStyles.resultRow}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={lumoStyles.resultCopy}>
        <Text style={lumoStyles.resultTitle}>{title}</Text>
        <Text style={lumoStyles.resultDescription}>{description}</Text>
      </View>
      <Text style={[lumoStyles.availability, available && lumoStyles.available]}>
        {available ? 'READY' : 'UNAVAILABLE'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preferenceShortcuts: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 },
  preferenceShortcut: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 9, borderRadius: 12, borderWidth: 1 },
  preferenceShortcutCopy: { flex: 1, minWidth: 0, gap: 2 },
  preferenceShortcutTitle: { fontSize: 11, fontWeight: '800' },
  preferenceShortcutValue: { fontSize: 10 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 36 },
  kicker: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 5,
    marginBottom: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountLogo: { width: 36, height: 36, borderRadius: 10 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  accountStatus: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 5,
  },
  statusMark: { color: colors.lime, fontSize: 17, fontWeight: '900' },
  search: {
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
  },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 10 },
  shortcut: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutMark: { color: colors.lime, fontSize: 17, fontWeight: '900' },
  shortcutLabel: { color: colors.text, fontSize: 11, fontWeight: '800' },
  switchAccountCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginTop: 4, marginBottom: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  switchAccountIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  switchAccountIconText: { color: colors.lime, fontSize: 22, fontWeight: '700' },
  switchAccountCopy: { flex: 1, gap: 4 },
  switchAccountTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  switchAccountDescription: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  switchAccountChevron: { color: colors.lime, fontSize: 24, paddingHorizontal: 4 },
  activityCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginTop: 0, marginBottom: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  activityIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  activityCopy: { flex: 1, gap: 4 },
  activityTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  activityDescription: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  premiumCard: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, marginTop: 0, marginBottom: 8, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  premiumIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  premiumCopy: { flex: 1, gap: 4 },
  premiumTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  premiumDescription: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 12,
    marginBottom: 6,
  },
  category: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryCopy: { flex: 1, minWidth: 0 },
  categoryTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  categoryDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  chevron: { color: colors.lime, fontSize: 24, paddingLeft: 4 },
  results: { marginTop: 7, marginBottom: 16 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultCopy: { flex: 1 },
  resultTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  resultDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  availability: {
    color: colors.muted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  available: { color: colors.lime },
  footer: { marginTop: 18, alignItems: 'center' },
  logoutButton: {
    minHeight: 46,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,111,145,0.3)',
    backgroundColor: 'rgba(255,111,145,0.08)',
  },
  logoutText: { color: colors.like, fontSize: 12, fontWeight: '900' },
  footerNote: {
    maxWidth: 300,
    marginTop: 11,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 16,
  },
});
