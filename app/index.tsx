
import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../lib/theme';

export default function Index() {
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

  return (
    <Redirect href={session ? '/(tabs)' : '/login'} />
  );
}
