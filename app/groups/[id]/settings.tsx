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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import { colors } from '../../../lib/theme';
import { getPlatformRoles } from '../../../lib/market-official';
import {
  getGroup,
  getGroupMembers,
  leaveGroup,
  updateGroupDetails,
  type ChatGroup,
  type GroupRole,
} from '../../../lib/groups';

export default function GroupSettings() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;

  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [role, setRole] = useState<GroupRole | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id || !me) {
      setLoading(false);
      setError('Your session is unavailable.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [groupData, members, platformRoles] = await Promise.all([
        getGroup(id),
        getGroupMembers(id),
        getPlatformRoles(me),
      ]);

      setGroup(groupData);
      setIsDeveloper(platformRoles.includes('developer') || platformRoles.includes('owner'));
      setName(groupData.name);
      setDescription(groupData.description ?? '');
      setIsPublic(groupData.is_public);

      const membership = members.find((member) => member.user_id === me);
      setRole((membership?.role as GroupRole) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load group settings.');
    } finally {
      setLoading(false);
    }
  }, [id, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = isDeveloper || role === 'owner' || role === 'admin';

  const save = async () => {
    if (!group || !name.trim() || !canManage || saving) return;

    if (name.trim().length > 80) {
      Alert.alert('Invalid name', 'Group name must be 80 characters or fewer.');
      return;
    }

    if (description.trim().length > 500) {
      Alert.alert('Description too long', 'Use no more than 500 characters.');
      return;
    }

    setSaving(true);

    try {
      await updateGroupDetails({
        groupId: group.id,
        name: name.trim(),
        description: description.trim(),
        avatarUrl: group.avatar_url ?? '',
        isPublic,
      });

      await load();
      Alert.alert('Changes saved', 'Your group settings have been updated.');
    } catch (err) {
      Alert.alert(
        'Could not save changes',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!group || !me || leaving) return;

    if (role === 'owner') {
      Alert.alert(
        'Ownership required',
        'Transfer group ownership to another member before leaving.',
      );
      return;
    }

    if (!leaving) {
      setLeaving(true);
      return;
    }

    setSaving(true);

    try {
      await leaveGroup(group.id);
      router.replace('/(tabs)/messages');
    } catch (err) {
      Alert.alert(
        'Could not leave group',
        err instanceof Error ? err.message : 'Please try again.',
      );
      setLeaving(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Group settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.muted} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : !group ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Group not found.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="people" size={27} color={colors.lime} />
            </View>
            <Text style={styles.heroName}>{group.name}</Text>
            <Text style={styles.heroRole}>{role?.toUpperCase() ?? 'MEMBER'}</Text>
          </View>

          {!canManage && (
            <View style={styles.notice}>
              <Ionicons name="lock-closed-outline" size={17} color={colors.muted} />
              <Text style={styles.noticeText}>
                Only group owners and admins can edit group details.
              </Text>
            </View>
          )}

          <Text style={styles.label}>GROUP NAME</Text>
          <TextInput
            style={[styles.input, !canManage && styles.readOnly]}
            value={name}
            onChangeText={setName}
            editable={canManage}
            maxLength={80}
            placeholder="Group name"
            placeholderTextColor={colors.dim}
          />
          <Text style={styles.counter}>{name.length}/80</Text>

          <Text style={styles.label}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.multiline, !canManage && styles.readOnly]}
            value={description}
            onChangeText={setDescription}
            editable={canManage}
            multiline
            textAlignVertical="top"
            maxLength={500}
            placeholder="Describe your group"
            placeholderTextColor={colors.dim}
          />
          <Text style={styles.counter}>{description.length}/500</Text>

          <View style={styles.visibilityCard}>
            <View style={styles.visibilityIcon}>
              <Ionicons
                name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
                size={19}
                color={colors.lime}
              />
            </View>
            <View style={styles.visibilityCopy}>
              <Text style={styles.visibilityTitle}>
                {isPublic ? 'Public group' : 'Private group'}
              </Text>
              <Text style={styles.visibilityHint}>
                {isPublic
                  ? 'Anyone can discover and join this group.'
                  : 'Only invited members can access this group.'}
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
              style={[styles.saveButton, saving && styles.disabled]}
              onPress={() => void save()}
              disabled={saving || !name.trim()}
            >
              {saving ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.bg} />
                  <Text style={styles.saveText}>Save changes</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable
            style={styles.membersButton}
            onPress={() => router.push(`/groups/${id}/member`)}
          >
            <Ionicons name="people-outline" size={18} color={colors.lime} />
            <Text style={styles.membersText}>Manage members</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>

          <Pressable
            style={styles.leaveButton}
            onPress={() => void handleLeave()}
            disabled={saving}
          >
            <Ionicons name="exit-outline" size={18} color="#FF6478" />
            <Text style={styles.leaveText}>
              {leaving ? 'Tap again to confirm leaving' : 'Leave group'}
            </Text>
          </Pressable>

          {leaving && (
            <Pressable onPress={() => setLeaving(false)} style={styles.cancelLeave}>
              <Text style={styles.cancelLeaveText}>Cancel</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  headerSpacer: { width: 40 },
  content: { padding: 18, paddingBottom: 45 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25 },
  errorText: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12 },
  retryButton: { marginTop: 18, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.lime },
  retryText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  hero: { alignItems: 'center', padding: 22, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 22 },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  heroRole: { color: colors.lime, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised, marginBottom: 13 },
  noticeText: { color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 18, marginBottom: 8 },
  input: { minHeight: 49, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 13 },
  readOnly: { opacity: 0.65 },
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
  membersButton: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  membersText: { color: colors.text, fontSize: 12, fontWeight: '800', flex: 1 },
  leaveButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, borderWidth: 1, borderColor: '#572B31', marginTop: 26 },
  leaveText: { color: '#FF6478', fontSize: 12, fontWeight: '800' },
  cancelLeave: { alignItems: 'center', padding: 12 },
  cancelLeaveText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
});
