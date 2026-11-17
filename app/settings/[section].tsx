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
import { colors } from '../../lib/theme';
import { settingsSections } from '../../lib/settingsCatalog';
import { supabase } from '../../lib/supabase';

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
  const params = useLocalSearchParams<{ section: string }>();
  const sectionId = Array.isArray(params.section)
    ? params.section[0]
    : params.section;
  const section = settingsSections.find((item) => item.id === sectionId);
  const { session } = useAuth();
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
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Settings' }} />
        <Text style={styles.title}>Settings not found</Text>
        <Pressable onPress={() => router.back()} style={styles.buttonSecondary}>
          <Text style={styles.buttonSecondaryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const verified = !!session?.user.email_confirmed_at;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: section.title }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>SETTINGS / {section.title.toUpperCase()}</Text>
        <Text style={styles.title}>{section.title}</Text>
        <Text style={styles.description}>{section.description}</Text>

        {section.id === 'account' ? (
          <>
            <View style={styles.infoCard}>
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
              style={styles.buttonPrimary}
              accessibilityRole="button"
            >
              <Text style={styles.buttonPrimaryText}>Edit profile</Text>
            </Pressable>
          </>
        ) : section.id === 'security' ? (
          <>
            <View style={styles.infoCard}>
              <InfoRow label="CURRENT EMAIL" value={session?.user.email ?? 'Unavailable'} />
              <InfoRow
                label="EMAIL STATUS"
                value={verified ? 'Verified' : 'Not verified'}
                accent={verified}
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Change email</Text>
              <Text style={styles.formDescription}>
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
                style={styles.input}
                accessibilityLabel="New email address"
              />
              <ActionButton
                label="Request email change"
                busy={busy}
                onPress={() => void changeEmail()}
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Change password</Text>
              <Text style={styles.formDescription}>
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
                style={styles.input}
                accessibilityLabel="New password"
              />
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                style={styles.input}
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
          <View style={styles.unavailableNotice}>
            <Text style={styles.noticeHeading}>Not available yet</Text>
            <Text style={styles.noticeBody}>
              These options are not active controls. The app does not have the
              backend or platform integration needed to save and enforce them.
            </Text>
          </View>
        )}

        <Text style={styles.listHeading}>
          {section.id === 'account' || section.id === 'security'
            ? 'CAPABILITIES'
            : 'OPTIONS'}
        </Text>
        {section.items.map((item) => (
          <View key={item.title} style={styles.itemRow}>
            <View style={styles.itemCopy}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>
            <Text
              style={[
                styles.availability,
                item.available && styles.availabilityReady,
              ]}
            >
              {item.available ? 'READY' : 'UNAVAILABLE'}
            </Text>
          </View>
        ))}
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
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, accent && styles.accentText]}
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
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.buttonPrimary, busy && styles.disabled]}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator color={colors.bg} size="small" />
      ) : (
        <Text style={styles.buttonPrimaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 38 },
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
    marginBottom: 16,
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
    minHeight: 56,
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
