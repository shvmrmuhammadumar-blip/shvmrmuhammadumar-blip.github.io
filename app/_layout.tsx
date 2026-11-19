import '../global.css';
import '../lib/location-sharing';
import '../lib/livekit-register';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { colors } from '../lib/theme';
import LumoAlertHost from '../components/LumoAlertHost';
import UserActivityTracker from '../components/UserActivityTracker';

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const signedIn = !!session;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text,
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
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
        <Stack.Screen name="market/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="market/originals/manage" options={{ headerShown: false }} />
        <Stack.Screen name="market/originals/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/create" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/manage" options={{ headerShown: false }} />
        <Stack.Screen name="market/store/manage/[id]" options={{ headerShown: false }} />
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
            contentStyle: { backgroundColor: '#050507' },
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

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" animated />
      <UserActivityTracker />
      <Gate />
      <LumoAlertHost />
    </AuthProvider>
  );
}
