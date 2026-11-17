import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../../components/Avatar';
import GroupMemberRow from '../../../components/groups/GroupMemberRow';
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { getPlatformRoles } from '../../../lib/market-official';
import {
  addGroupMembers,
  getGroup,
  getGroupMembers,
  removeGroupMember,
  setGroupMemberRole,
  transferGroupOwnership,
  type ChatGroup,
  type GroupMemberWithProfile,
  type GroupRole,
} from '../../../lib/groups';
import type { Database } from '../../../lib/database.types';

type Person = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'full_name' | 'avatar_url'
>;

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;

  const [group, setGroup] = useState<ChatGroup | null>(null);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [myRole, setMyRole] = useState<GroupRole | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [confirmAction, setConfirmAction] = useState('');

  const load = useCallback(async () => {
    if (!id || !me) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [groupData, memberData, platformRoles] = await Promise.all([
        getGroup(id),
        getGroupMembers(id),
        getPlatformRoles(me),
      ]);

      setGroup(groupData);
      setMembers(memberData);
      setIsDeveloper(platformRoles.includes('developer') || platformRoles.includes('owner'));

      const membership = memberData.find((item) => item.user_id === me);
      setMyRole((membership?.role as GroupRole) ?? null);
    } catch (err) {
      Alert.alert(
        'Could not load members',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, me]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = isDeveloper || myRole === 'owner' || myRole === 'admin';

  const searchPeople = async () => {
    const term = query.trim().replace(/[%_,]/g, '');

    if (!me || term.length < 2) {
      setPeople([]);
      return;
    }

    setSearching(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url')
        .neq('id', me)
        .ilike('username', `%${term}%`)
        .limit(20);

      if (error) throw error;

      const existing = new Set(members.map((member) => member.user_id));
      setPeople((data ?? []).filter((person) => !existing.has(person.id)));
    } catch (err) {
      Alert.alert(
        'Search failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSearching(false);
    }
  };

  const addPerson = async (person: Person) => {
    if (!id || busyId || !canManage) return;

    setBusyId(person.id);

    try {
      await addGroupMembers(id, [person.id]);
      setPeople((current) => current.filter((item) => item.id !== person.id));
      await load();
      Alert.alert('Member added', `@${person.username} has been added.`);
    } catch (err) {
      Alert.alert(
        'Could not add member',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setBusyId('');
    }
  };

  const changeRole = async (member: GroupMemberWithProfile) => {
    if (!id || busyId || member.user_id === me || member.role === 'owner') return;

    if (myRole !== 'owner' && !isDeveloper) {
      Alert.alert('Permission denied', 'Only the owner or Lumo Developer can appoint or remove admins.');
      return;
    }

    const nextRole = member.role === 'admin' ? 'member' : 'admin';

    setBusyId(member.user_id);

    try {
      await setGroupMemberRole(id, member.user_id, nextRole);
      await load();
    } catch (err) {
      Alert.alert(
        'Could not change role',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setBusyId('');
    }
  };

  const removeMember = async (member: GroupMemberWithProfile) => {
    if (!id || busyId || member.user_id === me || member.role === 'owner') return;

    const actionKey = `remove:${member.user_id}`;

    if (confirmAction !== actionKey) {
      setConfirmAction(actionKey);
      return;
    }

    setBusyId(member.user_id);

    try {
      await removeGroupMember(id, member.user_id);
      setConfirmAction('');
      await load();
    } catch (err) {
      Alert.alert(
        'Could not remove member',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setBusyId('');
    }
  };

  const transferOwnership = async (member: GroupMemberWithProfile) => {
    if (!id || myRole !== 'owner' || member.user_id === me || busyId) return;

    const actionKey = `owner:${member.user_id}`;

    if (confirmAction !== actionKey) {
      setConfirmAction(actionKey);
      return;
    }

    setBusyId(member.user_id);

    try {
      await transferGroupOwnership(id, member.user_id);
      setConfirmAction('');
      await load();
      Alert.alert('Ownership transferred', 'The new owner has been appointed.');
    } catch (err) {
      Alert.alert(
        'Could not transfer ownership',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setBusyId('');
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>

        <View style={styles.headerCopy}>
          <Text style={styles.title}>Group members</Text>
          <Text style={styles.subtitle}>
            {group?.name ?? 'Group'} · {members.length} members
          </Text>
        </View>

        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {canManage && (
            <View style={styles.searchCard}>
              <Text style={styles.sectionTitle}>Add people</Text>
              <Text style={styles.sectionHint}>
                Find Lumo users by username.
              </Text>

              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={17} color={colors.muted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    setConfirmAction('');
                  }}
                  onSubmitEditing={() => void searchPeople()}
                  placeholder="Search username"
                  placeholderTextColor={colors.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                  returnKeyType="search"
                />
                <Pressable
                  style={styles.searchButton}
                  onPress={() => void searchPeople()}
                  disabled={searching}
                >
                  {searching ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Ionicons name="arrow-forward" size={17} color={colors.bg} />
                  )}
                </Pressable>
              </View>

              {people.map((person) => (
                <View key={person.id} style={styles.personRow}>
                  <Avatar uri={person.avatar_url} name={person.username} size={38} />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>@{person.username}</Text>
                    {!!person.full_name && (
                      <Text style={styles.personHint}>{person.full_name}</Text>
                    )}
                  </View>
                  <Pressable
                    style={styles.addButton}
                    onPress={() => void addPerson(person)}
                    disabled={!!busyId}
                  >
                    {busyId === person.id ? (
                      <ActivityIndicator color={colors.bg} size="small" />
                    ) : (
                      <Ionicons name="add" size={19} color={colors.bg} />
                    )}
                  </Pressable>
                </View>
              ))}

              {query.trim().length >= 2 && !searching && people.length === 0 && (
                <Text style={styles.noResults}>
                  No new users found. Try another username.
                </Text>
              )}
            </View>
          )}

          <View style={styles.membersHeading}>
            <View>
              <Text style={styles.sectionTitle}>All members</Text>
              <Text style={styles.sectionHint}>
                {members.length} people in this group
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{members.length}</Text>
            </View>
          </View>

          {members.map((member) => {
            const isSelf = member.user_id === me;
            const canChangeRole =
              myRole === 'owner' && !isSelf && member.role !== 'owner';
            const canRemove =
              canManage &&
              !isSelf &&
              member.role !== 'owner' &&
              (myRole === 'owner' || member.role !== 'admin');

            return (
              <View key={member.user_id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <GroupMemberRow
                    member={member}
                    currentUserId={me}
                  />
                </View>

                {canChangeRole && (
                  <Pressable
                    style={styles.actionButton}
                    onPress={() => void changeRole(member)}
                    disabled={!!busyId}
                  >
                    <Ionicons
                      name={member.role === 'admin' ? 'arrow-down-circle-outline' : 'shield-checkmark-outline'}
                      size={16}
                      color={colors.lime}
                    />
                  </Pressable>
                )}

                {canRemove && (
                  <Pressable
                    style={[
                      styles.removeButton,
                      confirmAction === `remove:${member.user_id}` && styles.confirmButton,
                    ]}
                    onPress={() => void removeMember(member)}
                    disabled={!!busyId}
                  >
                    {busyId === member.user_id ? (
                      <ActivityIndicator color="#FF6478" size="small" />
                    ) : (
                      <Ionicons name="person-remove-outline" size={15} color="#FF6478" />
                    )}
                  </Pressable>
                )}

                {myRole === 'owner' && !isSelf && member.role !== 'owner' && (
                  <Pressable
                    style={[
                      styles.ownerButton,
                      confirmAction === `owner:${member.user_id}` && styles.confirmOwnerButton,
                    ]}
                    onPress={() => void transferOwnership(member)}
                    disabled={!!busyId}
                  >
                    <Text style={styles.ownerButtonText}>
                      {confirmAction === `owner:${member.user_id}` ? 'Confirm' : 'Make owner'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {members.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={30} color={colors.muted} />
              <Text style={styles.emptyText}>No members found.</Text>
            </View>
          )}

          {confirmAction !== '' && (
            <Pressable
              style={styles.cancelAction}
              onPress={() => setConfirmAction('')}
            >
              <Text style={styles.cancelText}>Cancel pending action</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 65, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: colors.text, fontSize: 17, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  headerSpacer: { width: 39 },
  content: { padding: 16, paddingBottom: 45 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchCard: { padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 24 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 10, marginTop: 4 },
  searchRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.surfaceRaised, marginTop: 13 },
  searchInput: { flex: 1, color: colors.text, fontSize: 12, paddingVertical: 9 },
  searchButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 9 },
  personCopy: { flex: 1, marginLeft: 10 },
  personName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  personHint: { color: colors.muted, fontSize: 10, marginTop: 3 },
  addButton: { width: 33, height: 33, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  noResults: { color: colors.muted, fontSize: 11, paddingVertical: 13, textAlign: 'center' },
  membersHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.accentDark },
  countText: { color: colors.lime, fontSize: 10, fontWeight: '900' },
  memberCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingRight: 8 },
  memberInfo: { flex: 1 },
  actionButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  removeButton: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#291719', alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  confirmButton: { borderColor: '#FF6478', borderWidth: 1 },
  ownerButton: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 9, backgroundColor: colors.accentDark, marginLeft: 5 },
  confirmOwnerButton: { borderWidth: 1, borderColor: colors.lime },
  ownerButtonText: { color: colors.lime, fontSize: 9, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: 35 },
  emptyText: { color: colors.muted, fontSize: 11, marginTop: 10 },
  cancelAction: { alignItems: 'center', padding: 14 },
  cancelText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
});
