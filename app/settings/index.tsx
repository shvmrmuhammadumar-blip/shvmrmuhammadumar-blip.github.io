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
import { colors } from '../../lib/theme';
import { settingsSections } from '../../lib/settingsCatalog';
import { supabase } from '../../lib/supabase';

export default function SettingsHome() {
  const { session } = useAuth();
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
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <FlatList
        data={query.trim() ? [] : settingsSections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.kicker}>ACCOUNT CONTROL CENTER</Text>
            <Text style={styles.title}>Settings</Text>

            <View style={styles.accountCard}>
              <Image
                source={require('../../assets/lumo-mark.png')}
                style={styles.accountLogo}
                contentFit="contain"
              />
              <View style={styles.accountCopy}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {accountEmail}
                </Text>
                <Text style={styles.accountStatus}>
                  {emailVerified ? 'EMAIL VERIFIED' : 'EMAIL NOT VERIFIED'}
                </Text>
              </View>
              <Text style={styles.statusMark}>{emailVerified ? '✓' : '!'}</Text>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search settings"
              placeholderTextColor={colors.muted}
              style={styles.search}
              accessibilityLabel="Search settings"
              returnKeyType="search"
            />

            {query.trim() ? (
              <View style={styles.results}>
                <Text style={styles.sectionLabel}>
                  {searchResults.length ? 'MATCHING SETTINGS' : 'NO MATCHES'}
                </Text>
                {searchResults.map((result) => (
                  <SettingsRow
                    key={`${result.section.id}-${result.title}`}
                    title={result.title}
                    description={result.description}
                    available={result.available}
                    onPress={() => router.push(`/settings/${result.section.id}`)}
                  />
                ))}
              </View>
            ) : (
              <>
              <View style={styles.shortcuts}>
                <Pressable
                  onPress={() => router.push('/edit-profile')}
                  style={styles.shortcut}
                  accessibilityRole="button"
                >
                  <Text style={styles.shortcutMark}>↗</Text>
                  <Text style={styles.shortcutLabel}>Change profile</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/settings/security')}
                  style={styles.shortcut}
                  accessibilityRole="button"
                >
                  <Text style={styles.shortcutMark}>⌑</Text>
                  <Text style={styles.shortcutLabel}>Security</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => router.push('/switch-profile')}
                style={styles.switchAccountCard}
                accessibilityRole="button"
              >
                <View style={styles.switchAccountIcon}>
                  <Text style={styles.switchAccountIconText}>⇄</Text>
                </View>
                <View style={styles.switchAccountCopy}>
                  <Text style={styles.switchAccountTitle}>Switch profile</Text>
                  <Text style={styles.switchAccountDescription}>Move between Lumo accounts on this device</Text>
                </View>
                <Text style={styles.switchAccountChevron}>›</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/settings/activity')}
                style={styles.activityCard}
                accessibilityRole="button"
              >
                <View style={styles.activityIcon}>
                  <Ionicons name="time-outline" size={19} color={colors.lime} />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle}>Your activity</Text>
                  <Text style={styles.activityDescription}>Review your likes, comments, forwards, Reels and time in Lumo</Text>
                </View>
                <Text style={styles.switchAccountChevron}>›</Text>
              </Pressable>
              </>
            )}

            {!query.trim() && <Text style={styles.sectionLabel}>ALL SETTINGS</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.category}
            onPress={() => router.push(`/settings/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}. ${item.description}`}
          >
            <View style={styles.categoryCopy}>
              <Text style={styles.categoryTitle}>{item.title}</Text>
              <Text style={styles.categoryDescription}>{item.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListFooterComponent={
          query.trim() ? null : (
            <View style={styles.footer}>
              <Pressable
                onPress={logout}
                disabled={signingOut}
                style={styles.logoutButton}
                accessibilityRole="button"
              >
                {signingOut ? (
                  <ActivityIndicator color={colors.like} size="small" />
                ) : (
                  <Text style={styles.logoutText}>Log out</Text>
                )}
              </Pressable>
              <Text style={styles.footerNote}>
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
  return (
    <Pressable
      style={styles.resultRow}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.resultCopy}>
        <Text style={styles.resultTitle}>{title}</Text>
        <Text style={styles.resultDescription}>{description}</Text>
      </View>
      <Text style={[styles.availability, available && styles.available]}>
        {available ? 'READY' : 'UNAVAILABLE'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 5,
    marginBottom: 16,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountLogo: { width: 42, height: 42, borderRadius: 12 },
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
    minHeight: 48,
    marginTop: 14,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
  },
  shortcuts: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 23 },
  shortcut: {
    flex: 1,
    minHeight: 52,
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
  switchAccountCard: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: -12, marginBottom: 18, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  switchAccountIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  switchAccountIconText: { color: colors.lime, fontSize: 22, fontWeight: '700' },
  switchAccountCopy: { flex: 1, gap: 4 },
  switchAccountTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  switchAccountDescription: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  switchAccountChevron: { color: colors.lime, fontSize: 24, paddingHorizontal: 4 },
  activityCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginTop: -6, marginBottom: 18, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  activityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  activityCopy: { flex: 1, gap: 4 },
  activityTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  activityDescription: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 18,
    marginBottom: 9,
  },
  category: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryCopy: { flex: 1 },
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
