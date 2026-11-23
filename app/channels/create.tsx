import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../lib/alert';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';
import {
  createChannel,
  getMyProfile,
  uploadChannelAvatar,
} from '../../lib/channels';
import { useThemedStyles } from "../../lib/theme-styles";

export default function CreateChannel() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;

  const [ownerUsername, setOwnerUsername] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load owner username on mount
  useEffect(() => {
    if (!me) return;
    void (async () => {
      try {
        const profile = await getMyProfile(me);
        if (profile) setOwnerUsername(profile.username);
      } catch {
        // Ignore — will show empty prefix
      }
    })();
  }, [me]);

  const fullUsername = ownerUsername && slug
    ? `${ownerUsername}-${slug}`
    : '';

  const pickAvatar = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Ruxsat kerak',
        'Galereyaga kirishga ruxsat bering.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets?.length) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleCreate = async () => {
    if (!me) {
      Alert.alert('Tizimga kiring', 'Iltimos, qayta tizimga kiring.');
      return;
    }

    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanDescription = description.trim();

    if (!cleanName || cleanName.length > 80) {
      Alert.alert("Noto'g'ri nom", '1 dan 80 tagacha belgi kiriting.');
      return;
    }

    if (!/^[a-z0-9_]{1,30}$/.test(cleanSlug)) {
      Alert.alert(
        "Noto'g'ri slug",
        "Slug faqat kichik harflar, raqamlar va pastki chiziq bo'lishi kerak (1–30 belgi).",
      );
      return;
    }

    if (cleanDescription.length > 500) {
      Alert.alert('Tavsif juda uzun', "500 belgidan kam bo'lsin.");
      return;
    }

    setBusy(true);

    try {
      // First create the channel
      const channelId = await createChannel({
        name: cleanName,
        slug: cleanSlug,
        description: cleanDescription,
        isPublic,
      });

      // Then upload avatar if selected
      if (avatarUri && channelId) {
        try {
          const avatarUrl = await uploadChannelAvatar(channelId, me, avatarUri);

          // Update channel with avatar URL
          const { updateChannelDetails, extractSlug } = await import('../../lib/channels');
          await updateChannelDetails({
            channelId,
            name: cleanName,
            slug: cleanSlug,
            description: cleanDescription,
            avatarUrl,
            isPublic,
          });
        } catch {
          // Channel created but avatar failed — not critical
          console.warn("Avatar yuklash muvaffaqiyatsiz bo'ldi");
        }
      }

      router.back();
    } catch (error) {
      Alert.alert(
        "Kanal yaratib bo'lmadi",
        error instanceof Error ? error.message : "Qayta urinib ko'ring.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={lumoStyles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={lumoStyles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={lumoStyles.header}>
          <Pressable
            onPress={() => router.back()}
            style={lumoStyles.backButton}
            hitSlop={10}
          >
            <Ionicons name="arrow-back" size={21} color={colors.text} />
          </Pressable>

          <View style={lumoStyles.headerCopy}>
            <Text style={lumoStyles.eyebrow}>YOUR BROADCAST SPACE</Text>
            <Text style={lumoStyles.title}>Create channel</Text>
          </View>

          <View style={lumoStyles.headerSpacer} />
        </View>

        {/* Avatar picker */}
        <Pressable
          style={lumoStyles.avatarCard}
          onPress={() => void pickAvatar()}
          accessibilityRole="button"
          accessibilityLabel="Kanal rasmini tanlash"
        >
          {avatarUri ? (
            <Image
              source={{ uri: avatarUri }}
              style={lumoStyles.avatarImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={lumoStyles.avatarPlaceholder}>
              <Ionicons name="camera" size={32} color={colors.lime} />
            </View>
          )}

          <View style={lumoStyles.avatarCopy}>
            <Text style={lumoStyles.avatarTitle}>Kanal rasmi</Text>
            <Text style={lumoStyles.avatarHint}>
              {avatarUri
                ? "Rasmni o'zgartirish uchun bosing"
                : 'Rasm tanlash uchun bosing'}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>

        <View style={lumoStyles.section}>
          <Text style={lumoStyles.label}>KANAL NOMI</Text>
          <TextInput
            style={lumoStyles.input}
            placeholder="Kanal nomini kiriting"
            placeholderTextColor={colors.dim}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
          <Text style={lumoStyles.counter}>{name.length}/80</Text>
        </View>

        <View style={lumoStyles.section}>
          <Text style={lumoStyles.label}>KANAL SLUG</Text>
          <View style={lumoStyles.slugInput}>
            <Text style={lumoStyles.slugPrefix}>
              @{ownerUsername || '...'}-
            </Text>
            <TextInput
              style={lumoStyles.slugField}
              placeholder="kanal_nomi"
              placeholderTextColor={colors.dim}
              value={slug}
              onChangeText={(value) =>
                setSlug(value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30))
              }
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>
          {fullUsername ? (
            <Text style={lumoStyles.usernamePreview}>
              Kanal linki: @{fullUsername}
            </Text>
          ) : (
            <Text style={lumoStyles.helper}>
              Faqat kichik harflar, raqamlar va pastki chiziq. 1–30 belgi.
            </Text>
          )}
        </View>

        <View style={lumoStyles.section}>
          <Text style={lumoStyles.label}>TAVSIF</Text>
          <TextInput
            style={[lumoStyles.input, lumoStyles.descriptionInput]}
            placeholder="Kanal nima haqida?"
            placeholderTextColor={colors.dim}
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            textAlignVertical="top"
          />
          <Text style={lumoStyles.counter}>{description.length}/500</Text>
        </View>

        <View style={lumoStyles.visibilityCard}>
          <View style={lumoStyles.visibilityIcon}>
            <Ionicons
              name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
              size={19}
              color={colors.lime}
            />
          </View>

          <View style={lumoStyles.visibilityCopy}>
            <Text style={lumoStyles.visibilityTitle}>
              {isPublic ? 'Ochiq kanal' : 'Yopiq kanal'}
            </Text>
            <Text style={lumoStyles.visibilityDescription}>
              {isPublic
                ? "Har kim topishi va obuna bo'lishi mumkin."
                : "Faqat taklif qilinganlar ko'ra oladi."}
            </Text>
          </View>

          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{
              false: colors.border,
              true: colors.accentDark,
            }}
            thumbColor={isPublic ? colors.lime : colors.muted}
            accessibilityLabel="Kanalni ochiq qilish"
          />
        </View>

        <Pressable
          style={[
            lumoStyles.createButton,
            (busy || !name.trim() || !slug.trim()) &&
              lumoStyles.createButtonDisabled,
          ]}
          onPress={() => void handleCreate()}
          disabled={busy || !name.trim() || !slug.trim()}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <Ionicons name="megaphone" size={18} color={colors.bg} />
              <Text style={lumoStyles.createButtonText}>Kanal yaratish</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 40,
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 19,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    marginLeft: 12,
  },
  headerSpacer: {
    width: 40,
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.text,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 3,
  },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 23,
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 23,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  avatarCopy: {
    flex: 1,
    marginLeft: 15,
  },
  avatarTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  avatarHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  section: {
    marginBottom: 17,
  },
  label: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  input: {
    minHeight: 49,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  slugInput: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  slugPrefix: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '800',
    marginRight: 2,
  },
  slugField: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 12,
  },
  usernamePreview: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
    paddingLeft: 2,
  },
  helper: {
    color: colors.dim,
    fontSize: 10,
    marginTop: 6,
  },
  descriptionInput: {
    minHeight: 92,
    paddingTop: 13,
  },
  counter: {
    color: colors.dim,
    fontSize: 10,
    textAlign: 'right',
    marginTop: 5,
  },
  visibilityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginTop: 1,
    marginBottom: 25,
  },
  visibilityIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityCopy: {
    flex: 1,
    marginHorizontal: 11,
  },
  visibilityTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  visibilityDescription: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 3,
  },
  createButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: colors.lime,
    borderRadius: 15,
    marginTop: 3,
  },
  createButtonDisabled: {
    opacity: 0.45,
  },
  createButtonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
});
