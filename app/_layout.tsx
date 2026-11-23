import '../global.css';
import '../lib/location-sharing';
import '../lib/livekit-register';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { PreferencesProvider, usePreferences } from '../lib/preferences';
import LumoAlertHost from '../components/LumoAlertHost';
import UserActivityTracker from '../components/UserActivityTracker';
import { resolveThemeColor } from "../lib/theme-styles";
import { DirectCallsProvider } from '../lib/direct-calls';

function Gate() {
  const { session, loading } = useAuth();
  const { palette } = usePreferences();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  const signedIn = !!session;

  return (
    <Stack
      screenOptions={{
        headerTintColor: palette.text,
        headerStyle: { backgroundColor: palette.bg },
        headerTitleStyle: { color: palette.text, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="live" options={{ headerShown: false }} />
        <Stack.Screen name="settings/activity" options={{ title: 'Your activity' }} />
        <Stack.Screen name="creator-studio" options={{ headerShown: false, animation: 'fade', presentation: 'fullScreenModal' }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="post-viewer/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ title: 'Profile' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="edit-profile" options={{ title: 'Change Profile' }} />
        <Stack.Screen name="switch-profile" options={{ title: 'Switch Profile' }} />
        <Stack.Screen name="market/create" options={{ headerShown: false }} />
        <Stack.Screen name="market/originals/manage" options={{ headerShown: false }} />
        <Stack.Screen name="market/originals/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/create" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="gifts/index" options={{ headerShown: false }} />
        <Stack.Screen name="gifts/manage" options={{ headerShown: false }} />
        <Stack.Screen name="premium/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
        <Stack.Screen name="settings/[section]" options={{ title: 'Settings' }} />
        <Stack.Screen
          name="story/[id]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen
          name="media-viewer"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
            contentStyle: { backgroundColor: resolveThemeColor("#050507", "backgroundColor") },
            gestureEnabled: true,
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

function AppRoot() {
  const { theme } = usePreferences();

  return (
    <>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} animated />
      <UserActivityTracker />
      <Gate />
      <LumoAlertHost />
    </>
  );
}

export default function RootLayout() {
  // Preload Ionicons at the root so Expo Router can emit a web font preload
  // before individual icon components mount.
  useFonts(Ionicons.font);

  return (
    <AuthProvider>
      <PreferencesProvider>
        <DirectCallsProvider>
          <AppRoot />
        </DirectCallsProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
