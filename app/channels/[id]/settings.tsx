import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { getPlatformRoles } from '../../../lib/market-official';
import {
  deleteChannel,
  extractSlug,
  getChannel,
  leaveChannel,
  updateChannelDetails,
  uploadChannelAvatar,
  type Channel,
  type ChannelRole,
} from '../../../lib/channels';
import { useThemedStyles, resolveThemeColor } from "../../../lib/theme-styles";


export default function ChannelSettings() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [role, setRole] = useState<ChannelRole | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerPrefix, setOwnerPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id || !me) {
      setLoading(false);
      setError('Sessiya mavjud emas.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [channelData, membership, platformRoles] = await Promise.all([
        getChannel(id),
        supabase
          .from('channel_members')
          .select('role')
          .eq('channel_id', id)
          .eq('user_id', me)
          .maybeSingle(),
        getPlatformRoles(me),
      ]);

      if (membership.error) throw membership.error;

      // Extract owner prefix and slug from username
      const hyphenIdx = channelData.username.indexOf('-');
      const prefix = hyphenIdx >= 0 ? channelData.username.slice(0, hyphenIdx) : '';
      const channelSlug = extractSlug(channelData.username);

      setChannel(channelData);
      setRole((membership.data?.role as ChannelRole) ?? null);
      setIsDeveloper(platformRoles.includes('developer') || platformRoles.includes('owner'));
      setName(channelData.name);
      setSlug(channelSlug);
      setOwnerPrefix(prefix);
      setDescription(channelData.description ?? '');
      setIsPublic(channelData.is_public);
      setAvatarUri(channelData.avatar_url ?? null);
      setAvatarChanged(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sozlamalar yuklanmadi.');
    } finally {
      setLoading(false);
    }
  }, [id, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage =
    isDeveloper ||
    channel?.owner_id === me ||
    role === 'owner' ||
    role === 'admin';

  const isOwner =
    channel?.owner_id === me || role === 'owner';

  const pickAvatar = async () => {
    if (!canManage) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Ruxsat kerak', 'Galereyaga kirishga ruxsat bering.');
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
      setAvatarChanged(true);
    }
  };

  const save = async () => {
    if (!channel || !canManage || saving || !me) return;

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
        'Faqat kichik harflar, raqamlar va pastki chiziq (1–30 belgi).',
      );
      return;
    }

    if (cleanDescription.length > 500) {
      Alert.alert('Tavsif juda uzun', "500 belgidan kam bo'lsin.");
      return;
    }

    setSaving(true);

    try {
      let finalAvatarUrl = channel.avatar_url ?? '';

      // Upload new avatar if changed
      if (avatarChanged && avatarUri) {
        finalAvatarUrl = await uploadChannelAvatar(channel.id, me, avatarUri);
      }

      await updateChannelDetails({
        channelId: channel.id,
        name: cleanName,
        slug: cleanSlug,
        description: cleanDescription,
        avatarUrl: finalAvatarUrl,
        isPublic,
      });

      await load();
      Alert.alert('Saqlandi', 'Kanal sozlamalari yangilandi.');
    } catch (err) {
      Alert.alert(
        "Saqlab bo'lmadi",
        err instanceof Error ? err.message : "Qayta urinib ko'ring.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!channel || !me || saving) return;

    if (isOwner) {
      Alert.alert(
        'Egaliklarni topshiring',
        'Kanaldan chiqish uchun avval egaliklarni boshqaga bering.',
      );
      return;
    }

    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }

    setSaving(true);

    try {
      await leaveChannel(channel.id);
      router.replace('/(tabs)/messages');
    } catch (err) {
      Alert.alert(
        "Chiqib bo'lmadi",
        err instanceof Error ? err.message : "Qayta urinib ko'ring.",
      );
      setConfirmLeave(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!channel || !isOwner || saving) return;

    Alert.alert(
      'Kanalni o‘chirish',
      `“${channel.name}” kanalini o‘chirmoqchimisiz? Bu amalni ortga qaytarib bo‘lmaydi.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);

            try {
              await deleteChannel(channel.id);

              router.replace({
                pathname: '/(tabs)/messages',
                params: { category: 'Channels' },
              });

              Alert.alert(
                'Kanal o‘chirildi',
                'Kanal muvaffaqiyatli o‘chirildi.',
              );
            } catch (err) {
              Alert.alert(
                "O'chirib bo'lmadi",
                err instanceof Error ? err.message : "Qayta urinib ko'ring.",
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={lumoStyles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={lumoStyles.header}>
        <Pressable onPress={() => router.back()} style={lumoStyles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={lumoStyles.headerTitle}>Kanal sozlamalari</Text>
        <View style={lumoStyles.headerSpacer} />
      </View>

      {loading ? (
        <View style={lumoStyles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
        </View>
      ) : error ? (
        <View style={lumoStyles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.muted} />
          <Text style={lumoStyles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={lumoStyles.retryButton}>
            <Text style={lumoStyles.retryText}>Qayta urinish</Text>
          </Pressable>
        </View>
      ) : !channel ? (
        <View style={lumoStyles.center}>
          <Text style={lumoStyles.errorText}>Kanal topilmadi.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={lumoStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar section */}
          <Pressable
            style={lumoStyles.avatarCard}
            onPress={() => void pickAvatar()}
            disabled={!canManage}
            accessibilityRole="button"
            accessibilityLabel="Kanal rasmini o'zgartirish"
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
                <Ionicons name="megaphone" size={27} color={colors.lime} />
              </View>
            )}
            <View style={lumoStyles.avatarInfo}>
              <Text style={lumoStyles.heroName}>{channel.name}</Text>
              <Text style={lumoStyles.heroUsername}>@{channel.username}</Text>
              <Text style={lumoStyles.heroRole}>
                {role?.toUpperCase() ?? 'SUBSCRIBER'}
              </Text>
            </View>
            {canManage && (
              <View style={lumoStyles.avatarEditBadge}>
                <Ionicons name="camera" size={14} color={colors.lime} />
              </View>
            )}
          </Pressable>

          {!canManage && (
            <View style={lumoStyles.notice}>
              <Ionicons name="lock-closed-outline" size={17} color={colors.muted} />
              <Text style={lumoStyles.noticeText}>
                Faqat kanal egasi va adminlar sozlamalarni o'zgartirishi mumkin.
              </Text>
            </View>
          )}

          <Text style={lumoStyles.label}>KANAL NOMI</Text>
          <TextInput
            style={[lumoStyles.input, !canManage && lumoStyles.readOnly]}
            value={name}
            onChangeText={setName}
            editable={canManage}
            maxLength={80}
            placeholder="Kanal nomi"
            placeholderTextColor={colors.dim}
          />

          <Text style={lumoStyles.label}>KANAL SLUG</Text>
          <View style={[lumoStyles.slugInput, !canManage && lumoStyles.readOnly]}>
            <Text style={lumoStyles.slugPrefix}>
              @{ownerPrefix}-
            </Text>
            <TextInput
              style={lumoStyles.slugField}
              value={slug}
              onChangeText={(value) =>
                setSlug(
                  value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30),
                )
              }
              editable={canManage}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="kanal_nomi"
              placeholderTextColor={colors.dim}
            />
          </View>
          {ownerPrefix && slug ? (
            <Text style={lumoStyles.usernamePreview}>
              To'liq link: @{ownerPrefix}-{slug}
            </Text>
          ) : (
            <Text style={lumoStyles.helper}>
              Faqat kichik harflar, raqamlar va pastki chiziq.
            </Text>
          )}

          <Text style={lumoStyles.label}>TAVSIF</Text>
          <TextInput
            style={[lumoStyles.input, lumoStyles.multiline, !canManage && lumoStyles.readOnly]}
            value={description}
            onChangeText={setDescription}
            editable={canManage}
            multiline
            textAlignVertical="top"
            maxLength={500}
            placeholder="Kanalni tasvirlab bering"
            placeholderTextColor={colors.dim}
          />
          <Text style={lumoStyles.counter}>{description.length}/500</Text>

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
              <Text style={lumoStyles.visibilityHint}>
                {isPublic
                  ? "Har kim topishi va obuna bo'lishi mumkin."
                  : "Faqat taklif qilinganlar ko'ra oladi."}
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              disabled={!canManage}
              trackColor={{ false: colors.border, true: colors.accentDark }}
              thumbColor={isPublic ? colors.lime : colors.muted}
            />
          </View>

          {canManage && (
            <Pressable
              style={[lumoStyles.saveButton, saving && lumoStyles.disabled]}
              onPress={() => void save()}
              disabled={saving || !name.trim() || !slug.trim()}
            >
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.bg} />
                  <Text style={lumoStyles.saveText}>Saqlash</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable
            style={lumoStyles.subscribersButton}
            onPress={() => router.push(`/channels/${id}/members`)}
          >
            <Ionicons name="people-outline" size={18} color={colors.lime} />
            <Text style={lumoStyles.subscribersText}>A’zolarni boshqarish</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>

          {/* Leave channel (non-owner) */}
          {!isOwner && (
            <>
              <Pressable
                style={lumoStyles.leaveButton}
                onPress={() => void handleLeave()}
                disabled={saving}
              >
                <Ionicons name="exit-outline" size={18} color={resolveThemeColor("#FF6478", "color")} />
                <Text style={lumoStyles.leaveText}>
                  {confirmLeave ? 'Chiqishni tasdiqlash uchun qayta bosing' : 'Kanaldan chiqish'}
                </Text>
              </Pressable>

              {confirmLeave && (
                <Pressable onPress={() => setConfirmLeave(false)} style={lumoStyles.cancelAction}>
                  <Text style={lumoStyles.cancelActionText}>Bekor qilish</Text>
                </Pressable>
              )}
            </>
          )}

          {/* Delete channel (owner only) */}
          {isOwner && (
            <>
              <View style={lumoStyles.dangerSection}>
                <Text style={lumoStyles.dangerLabel}>XAVFLI HUDUD</Text>

                <Pressable
                  style={lumoStyles.deleteButton}
                  onPress={() => void handleDelete()}
                  disabled={saving}
                >
                  <Ionicons name="trash-outline" size={18} color={resolveThemeColor("#FF6478", "color")} />
                  <Text style={lumoStyles.deleteText}>
                    {confirmDelete
                      ? "O'chirishni tasdiqlash uchun qayta bosing"
                      : "Kanalni o'chirish"}
                  </Text>
                </Pressable>

                {confirmDelete && (
                  <>
                    <Text style={lumoStyles.deleteWarning}>
                      Bu amalni ortga qaytarib bo'lmaydi. Barcha postlar, obunachilari va ma'lumotlar
                      butunlay o'chiriladi.
                    </Text>
                    <Pressable
                      onPress={() => setConfirmDelete(false)}
                      style={lumoStyles.cancelAction}
                    >
                      <Text style={lumoStyles.cancelActionText}>Bekor qilish</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  headerSpacer: { width: 40 },
  content: { padding: 18, paddingBottom: 45 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25 },
  errorText: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
  retryButton: { marginTop: 18, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.lime },
  retryText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  avatarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInfo: {
    flex: 1,
    marginLeft: 14,
  },
  heroName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  heroUsername: { color: colors.lime, fontSize: 11, fontWeight: '800', marginTop: 4 },
  heroRole: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  avatarEditBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised, marginBottom: 13 },
  noticeText: { color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  input: { minHeight: 49, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13 },
  readOnly: { opacity: 0.65 },
  slugInput: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    backgroundColor: colors.surface,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slugPrefix: {
    color: colors.lime,
    fontSize: 13,
    fontWeight: '900',
    marginRight: 2,
  },
  slugField: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 12 },
  usernamePreview: {
    color: colors.lime,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
    paddingLeft: 2,
  },
  helper: { color: colors.dim, fontSize: 10, marginTop: 6 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  counter: { color: colors.dim, fontSize: 9, textAlign: 'right', marginTop: 5 },
  visibilityCard: { flexDirection: 'row', alignItems: 'center', padding: 13, borderRadius: 15, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 22 },
  visibilityIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' },
  visibilityCopy: { flex: 1, marginHorizontal: 11 },
  visibilityTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  visibilityHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  saveButton: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: colors.lime, marginTop: 23 },
  saveText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  subscribersButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  subscribersText: { color: colors.text, fontSize: 12, fontWeight: '800', flex: 1 },
  leaveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: '#572B31', marginTop: 26 },
  leaveText: { color: '#FF6478', fontSize: 12, fontWeight: '800' },
  cancelAction: { alignItems: 'center', padding: 14 },
  cancelActionText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  dangerSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#572B31',
  },
  dangerLabel: {
    color: '#FF6478',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  deleteButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 100, 120, 0.08)',
    borderWidth: 1,
    borderColor: '#572B31',
  },
  deleteText: {
    color: '#FF6478',
    fontSize: 12,
    fontWeight: '800',
  },
  deleteWarning: {
    color: '#FF6478',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
    opacity: 0.8,
  },
});
