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
import { Alert } from '../lib/alert';
import { useRouter } from 'expo-router';
import Avatar from '../components/Avatar';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { pickImage, uploadImage } from '../lib/api';
import { colors } from '../lib/theme';
import { useThemedStyles, resolveThemeColor } from "../lib/theme-styles";


export default function EditProfile() {
  const lumoStyles = useThemedStyles(styles);
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, full_name, bio, avatar_url')
          .eq('id', me)
          .single();
        if (error) throw error;
        if (!active) return;
        setUsername(data.username ?? '');
        setFullName(data.full_name ?? '');
        setBio(data.bio ?? '');
        setAvatarUrl(data.avatar_url ?? null);
        setLoadError('');
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Could not load your profile.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfile();
    return () => { active = false; };
  }, [me]);

  const changePhoto = async () => {
    try {
      const uri = await pickImage([1, 1]);
      if (uri) setNewAvatarUri(uri);
    } catch (error) {
      Alert.alert('Photo library unavailable', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  const save = async () => {
    const name = username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,30}$/.test(name)) {
      Alert.alert('Invalid username', 'Use 3-30 letters, numbers, dots or underscores.');
      return;
    }
    setBusy(true);
    try {
      let finalAvatar = avatarUrl;
      if (newAvatarUri) finalAvatar = await uploadImage(newAvatarUri, me, 'avatar');
      const { error } = await supabase
        .from('profiles')
        .update({ username: name, full_name: fullName.trim() || null, bio: bio.trim() || null, avatar_url: finalAvatar })
        .eq('id', me);
      if (error) {
        Alert.alert('Could not save', error.code === '23505' ? 'That username is already taken.' : error.message);
        return;
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={lumoStyles.center}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={lumoStyles.container} keyboardShouldPersistTaps="handled">
        {!!loadError && <Text style={lumoStyles.loadError} accessibilityRole="alert">{loadError}</Text>}
        <View style={lumoStyles.header}>
          <Text style={lumoStyles.eyebrow}>PROFILE SETTINGS</Text>
          <Text style={lumoStyles.title}>Edit identity</Text>
        </View>

        <Pressable onPress={changePhoto} style={lumoStyles.avatarWrap}>
          <Avatar uri={newAvatarUri ?? avatarUrl} name={username} size={96} />
          <Text style={lumoStyles.changePhoto}>Change photo</Text>
        </Pressable>

        <View style={lumoStyles.fieldWrap}>
          <Text style={lumoStyles.label}>Username</Text>
          <TextInput style={lumoStyles.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
        </View>
        <View style={lumoStyles.fieldWrap}>
          <Text style={lumoStyles.label}>Name</Text>
          <TextInput style={lumoStyles.input} value={fullName} onChangeText={setFullName} />
        </View>
        <View style={lumoStyles.fieldWrap}>
          <Text style={lumoStyles.label}>Bio</Text>
          <TextInput style={[lumoStyles.input, { minHeight: 90, textAlignVertical: 'top' }]} value={bio} onChangeText={setBio} multiline maxLength={150} />
        </View>

        <Pressable style={[lumoStyles.button, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.inverseText} /> : <Text style={lumoStyles.buttonText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  container: { padding: 20, gap: 10 },
  header: { paddingTop: 8, paddingBottom: 8 },
  eyebrow: { color: colors.muted, letterSpacing: 1.5, fontSize: 10, fontWeight: '800' },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.7, marginTop: 6 },
  avatarWrap: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  changePhoto: { color: colors.lime, fontWeight: '700' },
  fieldWrap: { marginTop: 2 },
  label: { color: colors.muted, marginTop: 10, marginBottom: 8, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  input: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  button: { backgroundColor: colors.accentStrong, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  buttonText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
  loadError: { color: colors.danger, fontSize: 13, lineHeight: 19, padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
});
