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
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../lib/alert';
import { Image } from 'expo-image';
import { useAuth } from '../lib/auth';
import { isConfigured } from '../lib/supabase';
import { colors } from '../lib/theme';
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


export default function Login() {
  const lumoStyles = useThemedStyles(styles);
  const { signIn, signUp } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const horizontalPadding = viewportWidth < 360 ? 12 : 16;
  const contentWidth = Math.max(0, viewportWidth - horizontalPadding * 2);
  const cardWidth = Math.min(contentWidth, 560);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  if (!isConfigured) {
    return (
      <View style={lumoStyles.center}>
        <Image
          source={require('../assets/lumo-mark.png')}
          style={lumoStyles.logoImage}
          contentFit="contain"
        />
        <Text style={lumoStyles.logo}>Lumo</Text>
        <Text style={lumoStyles.setup}>
          Supabase is not set up yet. Copy .env.example to .env, add your project URL and anon key, then restart the app
          with "npx expo start -c".
        </Text>
      </View>
    );
  }

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Check your details', 'Enter an email and a password of at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !/^[a-z0-9_.]{3,30}$/.test(username.trim().toLowerCase())) {
      Alert.alert('Invalid username', 'Use 3-30 letters, numbers, dots or underscores.');
      return;
    }
    setBusy(true);
    try {
      const message = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, username);
      if (message) Alert.alert(mode === 'login' ? 'Login' : 'Sign up', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      Alert.alert(mode === 'login' ? 'Login failed' : 'Sign up failed', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[lumoStyles.root, { width: viewportWidth }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[lumoStyles.scrollView, { width: viewportWidth }]} contentContainerStyle={[lumoStyles.container, { width: viewportWidth, paddingHorizontal: horizontalPadding }]} keyboardShouldPersistTaps="handled">
        <View style={[lumoStyles.heroPanel, { width: cardWidth }]}>
          <Image
            source={require('../assets/lumo-mark.png')}
            style={lumoStyles.logoImage}
            contentFit="contain"
            accessibilityLabel="Lumo lowercase u logo"
          />
          <Text style={lumoStyles.logo}>Lumo</Text>
          <Text style={lumoStyles.tagline}>Private moments. Shared energy.</Text>

        </View>

        <View style={[lumoStyles.panel, { width: cardWidth }]}>
          {mode === 'signup' && (
            <TextInput
              style={lumoStyles.input}
              placeholder="Username"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          )}
          <TextInput
            style={lumoStyles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={lumoStyles.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={[lumoStyles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.inverseText} /> : <Text style={lumoStyles.buttonText}>{mode === 'login' ? 'Log in' : 'Create account'}</Text>}
          </Pressable>

          <Pressable onPress={() => setMode(mode === 'login' ? 'signup' : 'login')} style={{ marginTop: 8 }}>
            <Text style={lumoStyles.switch}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={{ color: colors.lime, fontWeight: '700' }}>{mode === 'login' ? 'Sign up' : 'Log in'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', minWidth: 0, backgroundColor: colors.bg },
  scrollView: { flex: 1, width: '100%', minWidth: 0 },
  container: { flexGrow: 1, width: '100%', minWidth: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 28, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: colors.bg },
  heroPanel: { width: '100%', maxWidth: 560, minWidth: 0, alignItems: 'center', gap: 8, marginBottom: 4 },
  heroArtwork: { width: '100%', height: 184, borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginTop: 8, backgroundColor: colors.surfaceRaised },
  logoImage: { width: 76, height: 76, borderRadius: 20 },
  logo: { fontSize: 52, fontWeight: '900', color: colors.lime, textAlign: 'center', letterSpacing: 0.5 },
  tagline: { textAlign: 'center', color: colors.muted, marginBottom: 8, fontWeight: '600' },
  panel: {
    width: '100%',
    maxWidth: 560,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  setup: { textAlign: 'center', color: colors.text, lineHeight: 22, marginTop: 16 },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  switch: { textAlign: 'center', color: colors.muted },
});
