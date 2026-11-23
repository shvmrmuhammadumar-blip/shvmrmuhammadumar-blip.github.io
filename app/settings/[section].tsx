import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { colors, themeOptions, themePalettes } from '../../lib/theme';
import { usePreferences } from '../../lib/preferences';
import type { Locale } from '../../lib/preferences';
import { t } from '../../lib/localization';
import { settingsSections } from '../../lib/settingsCatalog';
import { supabase } from '../../lib/supabase';
import { useThemedStyles } from "../../lib/theme-styles";

function getErrorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Please try again.';
}

export default function SettingsSectionScreen() {
  const lumoStyles = useThemedStyles(styles);
  const params = useLocalSearchParams<{ section: string }>();
  const sectionId = Array.isArray(params.section)
    ? params.section[0]
    : params.section;
  const section = settingsSections.find((item) => item.id === sectionId);
  const { session } = useAuth();
  const { theme, locale, palette, setTheme, setLocale } = usePreferences();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const changeEmail = async () => {
    const nextEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return;
    }
    if (nextEmail === session?.user.email?.toLowerCase()) {
      Alert.alert('Email unchanged', 'Enter a different email address.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setEmail('');
      Alert.alert(
        'Check your inbox',
        'Supabase will send the required confirmation message before the email change is completed.',
      );
    } catch (error) {
      Alert.alert('Could not change email', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Check both password fields.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your new password is now active.');
    } catch (error) {
      Alert.alert('Could not update password', getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  if (!section) {
    return (
      <View style={[lumoStyles.center, { backgroundColor: palette.bg }]}>
        <Stack.Screen options={{ title: t(locale, 'Settings'), headerStyle: { backgroundColor: palette.bg }, headerTintColor: palette.text, headerTitleStyle: { color: palette.text } }} />
        <Text style={lumoStyles.title}>Settings not found</Text>
        <Pressable onPress={() => router.back()} style={lumoStyles.buttonSecondary}>
          <Text style={lumoStyles.buttonSecondaryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const verified = !!session?.user.email_confirmed_at;

  return (
    <KeyboardAvoidingView
      style={[lumoStyles.screen, { backgroundColor: palette.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: t(locale, section.title), headerStyle: { backgroundColor: palette.bg }, headerTintColor: palette.text, headerTitleStyle: { color: palette.text } }} />
      <ScrollView
        contentContainerStyle={lumoStyles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[lumoStyles.kicker, { color: palette.accent }]}>{t(locale, 'Settings').toUpperCase()} / {t(locale, section.title).toUpperCase()}</Text>
        <Text style={[lumoStyles.title, { color: palette.text }]}>{t(locale, section.title)}</Text>
        <Text style={[lumoStyles.description, { color: palette.muted }]}>{section.description}</Text>

        {section.id === 'appearance' ? (
          <View style={lumoStyles.preferenceSection}>
            <Text style={[lumoStyles.preferenceHeading, { color: palette.text }]}>{t(locale, 'Choose a color theme')}</Text>
            <Text style={[lumoStyles.preferenceHint, { color: palette.muted }]}>{t(locale, 'Changes are saved on this device')}</Text>
            {themeOptions.map((option) => {
              const optionPalette = themePalettes[option.id];
              const selected = theme === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    void setTheme(option.id).catch((error) =>
                      Alert.alert('Could not save theme', getErrorMessage(error)),
                    );
                  }}
                  style={[
                    lumoStyles.themeChoice,
                    {
                      backgroundColor: palette.surface,
                      borderColor: selected ? palette.accent : palette.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t(locale, option.label)}
                  accessibilityState={{ selected }}
                >
                  <View style={[lumoStyles.themePreview, { backgroundColor: optionPalette.bg, borderColor: optionPalette.border }]}>
                    <View style={[lumoStyles.themePreviewSurface, { backgroundColor: optionPalette.surface }]} />
                    <View style={[lumoStyles.themePreviewAccent, { backgroundColor: optionPalette.accent }]} />
                  </View>
                  <View style={lumoStyles.themeChoiceCopy}>
                    <Text style={[lumoStyles.themeChoiceTitle, { color: palette.text }]}>{t(locale, option.label)}</Text>
                    <Text style={[lumoStyles.themeChoiceDescription, { color: palette.muted }]} numberOfLines={1}>{t(locale, option.description)}</Text>
                  </View>
                  <View style={[lumoStyles.choiceIndicator, { borderColor: selected ? palette.accent : palette.muted }]}>
                    {selected ? <View style={[lumoStyles.choiceIndicatorInner, { backgroundColor: palette.accent }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : section.id === 'language' ? (
          <View style={lumoStyles.preferenceSection}>
            <Text style={[lumoStyles.preferenceHeading, { color: palette.text }]}>{t(locale, 'Choose a language')}</Text>
            <Text style={[lumoStyles.preferenceHint, { color: palette.muted }]}>{t(locale, 'Changes are saved on this device')}</Text>
            {([
              { id: 'uz', label: 'O‘zbekcha', code: 'UZ' },
              { id: 'en', label: 'English', code: 'EN' },
              { id: 'ru', label: 'Русский', code: 'RU' },
            ] as { id: Locale; label: string; code: string }[]).map((option) => {
              const selected = locale === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    void setLocale(option.id).catch((error) =>
                      Alert.alert('Could not save language', getErrorMessage(error)),
                    );
                  }}
                  style={[
                    lumoStyles.languageChoice,
                    {
                      backgroundColor: palette.surface,
                      borderColor: selected ? palette.accent : palette.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                >
                  <View style={[lumoStyles.languageCode, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
                    <Text style={[lumoStyles.languageCodeText, { color: palette.accent }]}>{option.code}</Text>
                  </View>
                  <Text style={[lumoStyles.languageChoiceTitle, { color: palette.text }]}>{option.label}</Text>
                  <View style={[lumoStyles.choiceIndicator, { borderColor: selected ? palette.accent : palette.muted }]}>
                    {selected ? <View style={[lumoStyles.choiceIndicatorInner, { backgroundColor: palette.accent }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : section.id === 'account' ? (
          <>
            <View style={lumoStyles.infoCard}>
              <InfoRow label="EMAIL" value={session?.user.email ?? 'Unavailable'} />
              <InfoRow
                label="VERIFICATION"
                value={verified ? 'Verified' : 'Not verified'}
                accent={verified}
              />
              <InfoRow
                label="ACCOUNT CREATED"
                value={
                  session?.user.created_at
                    ? new Date(session.user.created_at).toLocaleDateString()
                    : 'Not provided by the authentication service'
                }
              />
            </View>
            <Pressable
              onPress={() => router.push('/edit-profile')}
              style={lumoStyles.buttonPrimary}
              accessibilityRole="button"
            >
              <Text style={lumoStyles.buttonPrimaryText}>Edit profile</Text>
            </Pressable>
          </>
        ) : section.id === 'security' ? (
          <>
            <View style={lumoStyles.infoCard}>
              <InfoRow label="CURRENT EMAIL" value={session?.user.email ?? 'Unavailable'} />
              <InfoRow
                label="EMAIL STATUS"
                value={verified ? 'Verified' : 'Not verified'}
                accent={verified}
              />
            </View>

            <View style={lumoStyles.formCard}>
              <Text style={lumoStyles.formTitle}>Change email</Text>
              <Text style={lumoStyles.formDescription}>
                Supabase requires email confirmation. Your address changes only
                after the confirmation flow succeeds.
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="New email address"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={lumoStyles.input}
                accessibilityLabel="New email address"
              />
              <ActionButton
                label="Request email change"
                busy={busy}
                onPress={() => void changeEmail()}
              />
            </View>

            <View style={lumoStyles.formCard}>
              <Text style={lumoStyles.formTitle}>Change password</Text>
              <Text style={lumoStyles.formDescription}>
                Passwords are sent only to Supabase Auth and are never displayed
                or saved in app preferences.
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="New password (8+ characters)"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                style={lumoStyles.input}
                accessibilityLabel="New password"
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                style={lumoStyles.input}
                accessibilityLabel="Confirm new password"
              />
              <ActionButton
                label="Update password"
                busy={busy}
                onPress={() => void changePassword()}
              />
            </View>
          </>
        ) : (
          <View style={lumoStyles.unavailableNotice}>
            <Text style={lumoStyles.noticeHeading}>Not available yet</Text>
            <Text style={lumoStyles.noticeBody}>
              These options are not active controls. The app does not have the
              backend or platform integration needed to save and enforce them.
            </Text>
          </View>
        )}

        {section.id !== 'appearance' && section.id !== 'language' ? (
          <>
            <Text style={lumoStyles.listHeading}>
              {section.id === 'account' || section.id === 'security'
                ? 'CAPABILITIES'
                : 'OPTIONS'}
            </Text>
            {section.items.map((item) => (
          <View key={item.title} style={lumoStyles.itemRow}>
            <View style={lumoStyles.itemCopy}>
              <Text style={lumoStyles.itemTitle}>{item.title}</Text>
              <Text style={lumoStyles.itemDescription}>{item.description}</Text>
            </View>
            <Text
              style={[
                lumoStyles.availability,
                item.available && lumoStyles.availabilityReady,
              ]}
            >
              {item.available ? 'READY' : 'UNAVAILABLE'}
            </Text>
          </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InfoRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <View style={lumoStyles.infoRow}>
      <Text style={lumoStyles.infoLabel}>{label}</Text>
      <Text
        style={[lumoStyles.infoValue, accent && lumoStyles.accentText]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const lumoStyles = useThemedStyles(styles);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[lumoStyles.buttonPrimary, busy && lumoStyles.disabled]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.bg} size="small" />
      ) : (
        <Text style={lumoStyles.buttonPrimaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preferenceSection: { gap: 8, marginTop: 2 },
  preferenceHeading: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  preferenceHint: { fontSize: 10, lineHeight: 14, marginBottom: 4 },
  themeChoice: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, borderWidth: 1 },
  themePreview: { width: 42, height: 36, borderRadius: 9, borderWidth: 1, padding: 5, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  themePreviewSurface: { width: 17, height: 23, borderRadius: 4 },
  themePreviewAccent: { width: 9, height: 12, borderRadius: 3 },
  themeChoiceCopy: { flex: 1, minWidth: 0, gap: 3 },
  themeChoiceTitle: { fontSize: 12, fontWeight: '800' },
  themeChoiceDescription: { fontSize: 10 },
  choiceIndicator: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceIndicatorInner: { width: 9, height: 9, borderRadius: 5 },
  languageChoice: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, borderWidth: 1 },
  languageCode: { width: 35, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  languageCodeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  languageChoiceTitle: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: '800' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 12, paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.bg,
    padding: 24,
  },
  kicker: {
    color: colors.lime,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    marginTop: 6,
  },
  description: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 10,
  },
  infoCard: {
    paddingHorizontal: 14,
    paddingVertical: 2,
    marginBottom: 12,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '800',
  },
  infoValue: {
    flex: 1,
    color: colors.text,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '700',
  },
  accentText: { color: colors.lime },
  buttonPrimary: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.lime,
    marginTop: 8,
  },
  buttonPrimaryText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  buttonSecondary: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  buttonSecondaryText: { color: colors.text, fontWeight: '800' },
  formCard: {
    padding: 14,
    marginBottom: 12,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  formDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 10,
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    marginTop: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: 13,
  },
  disabled: { opacity: 0.65 },
  unavailableNotice: {
    padding: 15,
    marginBottom: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeHeading: { color: colors.lime, fontSize: 13, fontWeight: '900' },
  noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  listHeading: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginTop: 16,
    marginBottom: 7,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemCopy: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  itemDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  availability: {
    color: colors.muted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  availabilityReady: { color: colors.lime },
});
