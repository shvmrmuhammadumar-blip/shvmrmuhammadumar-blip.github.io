import React, { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import { getSavedAccounts, rememberAccount, type SavedAccount } from '../lib/saved-accounts';

export default function SwitchProfile() {
  const { session, signIn } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadAccounts = async () => {
      try {
        let saved = await getSavedAccounts();
        if (session?.user.id && session.user.email) {
          saved = await rememberAccount(session.user.id, session.user.email);
        }
        if (active) setAccounts(saved);
      } catch {
        if (active) setError('Could not load saved accounts. Please reopen this screen.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadAccounts();
    return () => { active = false; };
  }, [session?.user.id, session?.user.email]);

  const chooseAccount = (account: SavedAccount) => {
    if (account.id === session?.user.id) {
      router.back();
      return;
    }
    setSelectedAccount(account);
    setEmail(account.email);
    setPassword('');
    setError('');
  };

  const addAccount = () => {
    setSelectedAccount({ id: '', email: '' });
    setEmail('');
    setPassword('');
    setError('');
  };

  const cancelSignIn = () => {
    setSelectedAccount(null);
    setPassword('');
    setError('');
  };

  const continueWithAccount = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter this account password to continue.');
      return;
    }
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      const message = await signIn(normalizedEmail, password);
      if (message) {
        setError(message);
        return;
      }
      setPassword('');
      router.replace('/(tabs)/profile');
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Could not switch account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Switch Profile', headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>LUMO / ACCOUNT SPACE</Text>
          <Text style={styles.title}>Switch profile</Text>
          <Text style={styles.subtitle}>Choose an account already used on this device, or add another one.</Text>
        </View>

        <View style={styles.accountList}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.lime} />
              <Text style={styles.secondaryText}>Loading accounts…</Text>
            </View>
          ) : accounts.length ? (
            accounts.map((account) => {
              const current = account.id === session?.user.id;
              const selected = selectedAccount?.id === account.id && !!selectedAccount.id;
              return (
                <Pressable
                  key={account.id}
                  onPress={() => chooseAccount(account)}
                  style={[styles.accountRow, selected && styles.accountRowSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={current ? `${account.email}, current account` : `Switch to ${account.email}`}
                >
                  <View style={styles.accountIcon}>
                    <Ionicons name="person-outline" size={20} color={colors.text} />
                  </View>
                  <View style={styles.accountCopy}>
                    <Text style={styles.accountEmail} numberOfLines={1}>{account.email}</Text>
                    <Text style={styles.accountState}>{current ? 'CURRENT ACCOUNT' : 'TAP TO SWITCH'}</Text>
                  </View>
                  {current ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.lime} />
                  ) : (
                    <Ionicons name="chevron-forward" size={19} color={colors.muted} />
                  )}
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.secondaryText}>No saved accounts yet. Add another account below.</Text>
          )}
        </View>

        {!selectedAccount ? (
          <Pressable style={styles.addButton} onPress={addAccount} accessibilityRole="button">
            <Ionicons name="person-add-outline" size={19} color={colors.lime} />
            <Text style={styles.addButtonText}>Add another account</Text>
          </Pressable>
        ) : (
          <View style={styles.signInCard}>
            <View style={styles.formHeading}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>{selectedAccount.id ? 'Sign in to account' : 'Add another account'}</Text>
                <Text style={styles.secondaryText}>Confirm the password to switch securely.</Text>
              </View>
              <Pressable onPress={cancelSignIn} hitSlop={10} accessibilityLabel="Cancel account switch">
                <Ionicons name="close-circle-outline" size={23} color={colors.muted} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!selectedAccount.id}
              autoComplete="email"
            />

            <Text style={styles.fieldLabel}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Account password"
              placeholderTextColor={colors.muted}
              style={styles.input}
              secureTextEntry
              autoComplete="current-password"
              onSubmitEditing={() => void continueWithAccount()}
              returnKeyType="go"
            />

            {!!error && <Text style={styles.errorText} accessibilityRole="alert">{error}</Text>}

            <Pressable
              style={[styles.continueButton, busy && styles.buttonDisabled]}
              onPress={() => void continueWithAccount()}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.bg} /> : (
                <>
                  <Text style={styles.continueText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.bg} />
                </>
              )}
            </Pressable>
            <Text style={styles.securityNote}>Your password is never saved on this device.</Text>
          </View>
        )}

        <View style={styles.footerNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.muted} />
          <Text style={styles.footerText}>Only account emails are remembered here. Each account requires its password when you switch.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: 20, paddingBottom: 40, gap: 16 },
  heading: { gap: 7, paddingTop: 8, paddingBottom: 4 },
  eyebrow: { color: colors.lime, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, maxWidth: 420 },
  accountList: { gap: 9 },
  accountRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  accountRowSelected: { borderColor: colors.lime, backgroundColor: colors.surfaceRaised },
  accountIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  accountCopy: { flex: 1, minWidth: 0, gap: 5 },
  accountEmail: { color: colors.text, fontSize: 13, fontWeight: '800' },
  accountState: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12 },
  secondaryText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  addButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  addButtonText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  signInCard: { gap: 10, padding: 15, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 3 },
  formTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 3 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingHorizontal: 13, color: colors.text, fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 11, lineHeight: 16 },
  continueButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, backgroundColor: colors.lime, marginTop: 4 },
  buttonDisabled: { opacity: 0.65 },
  continueText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  securityNote: { color: colors.muted, fontSize: 9, textAlign: 'center' },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 5 },
  footerText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
});
