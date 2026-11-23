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
import { Alert } from '../../../lib/alert';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';
import { getPlatformRoles } from '../../../lib/market-official';
import {
  addChannelMembers,
  getChannel,
  getChannelMembers,
  setChannelMemberRole,
  transferChannelOwnership,
  type Channel,
  type ChannelMemberWithProfile,
  type ChannelRole,
} from '../../../lib/channels';
import type { Database } from '../../../lib/database.types';
import { useThemedStyles } from "../../../lib/theme-styles";

type Person = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'username' | 'full_name' | 'avatar_url'
>;

export default function ChannelSubscribersScreen() {
  const lumoStyles = useThemedStyles(styles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session?.user.id;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [subscribers, setSubscribers] = useState<ChannelMemberWithProfile[]>([]);
  const [myRole, setMyRole] = useState<ChannelRole | null>(null);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState('');

  const load = useCallback(async () => {
    if (!id || !me) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [channelData, memberData, platformRoles] = await Promise.all([
        getChannel(id),
        getChannelMembers(id),
        getPlatformRoles(me),
      ]);

      setChannel(channelData);
      setSubscribers(memberData);
      setIsDeveloper(platformRoles.includes('developer') || platformRoles.includes('owner'));

      const membership = memberData.find((item) => item.user_id === me);
      setMyRole(
        (membership?.role as ChannelRole) ??
        (channelData.owner_id === me ? 'owner' : null),
      );
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
    const term = query
      .trim()
      .replace(/^@+/, '')
      .replace(/[%,]/g, '')
      .trim();

    if (!me || term.length < 2) {
      setPeople([]);
      return;
    }

    setSearching(true);
    setPeople([]);

    try {
      const [usernameResult, nameResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .neq('id', me)
          .ilike('username', `%${term}%`)
          .limit(20),

        supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .neq('id', me)
          .ilike('full_name', `%${term}%`)
          .limit(20),
      ]);

      if (usernameResult.error) throw usernameResult.error;
      if (nameResult.error) throw nameResult.error;

      const uniquePeople = new Map<string, Person>();

      for (const person of usernameResult.data ?? []) {
        uniquePeople.set(person.id, person);
      }

      for (const person of nameResult.data ?? []) {
        uniquePeople.set(person.id, person);
      }

      const existing = new Set(
        subscribers.map((item) => item.user_id),
      );

      setPeople(
        Array.from(uniquePeople.values()).filter(
          (person) => !existing.has(person.id),
        ),
      );
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
      await addChannelMembers(id, [person.id]);
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

  const changeRole = async (member: ChannelMemberWithProfile) => {
    if (
      !id ||
      busyId ||
      (myRole !== 'owner' && !isDeveloper) ||
      member.user_id === me ||
      member.role === 'owner'
    ) return;

    const nextRole = member.role === 'admin' ? 'member' : 'admin';

    setBusyId(member.user_id);

    try {
      await setChannelMemberRole(id, member.user_id, nextRole);
      await load();
    } catch (err) {
      Alert.alert(
        'Could not update role',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setBusyId('');
    }
  };

  const transferOwnership = async (member: ChannelMemberWithProfile) => {
    if (
      !id ||
      busyId ||
      myRole !== 'owner' ||
      member.user_id === me ||
      member.role === 'owner'
    ) return;

    if (confirmTransfer !== member.user_id) {
      setConfirmTransfer(member.user_id);
      return;
    }

    setBusyId(member.user_id);

    try {
      await transferChannelOwnership(id, member.user_id);
      setConfirmTransfer('');
      await load();
      Alert.alert('Ownership transferred', 'The new channel owner has been appointed.');
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
    <View style={lumoStyles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={lumoStyles.header}>
        <Pressable onPress={() => router.back()} style={lumoStyles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={lumoStyles.headerCopy}>
          <Text style={lumoStyles.title}>Members</Text>
          <Text style={lumoStyles.subtitle}>
            {channel?.name ?? 'Channel'} · {subscribers.length} people
          </Text>
        </View>
        <View style={lumoStyles.headerSpacer} />
      </View>

      {loading ? (
        <View style={lumoStyles.center}>
          <ActivityIndicator color={colors.lime} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={lumoStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {canManage && (
            <View style={lumoStyles.searchCard}>
              <Text style={lumoStyles.sectionTitle}>Add members</Text>
              <Text style={lumoStyles.sectionHint}>
                Find Lumo users and invite them to your channel.
              </Text>

              <View style={lumoStyles.searchRow}>
                <Ionicons name="search-outline" size={17} color={colors.muted} />
                <TextInput
                  style={lumoStyles.searchInput}
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    setConfirmTransfer('');
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
                  style={lumoStyles.searchButton}
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
                <View key={person.id} style={lumoStyles.personRow}>
                  <Avatar uri={person.avatar_url} name={person.username} size={38} />
                  <View style={lumoStyles.personCopy}>
                    <Text style={lumoStyles.personName}>@{person.username}</Text>
                    {!!person.full_name && (
                      <Text style={lumoStyles.personHint}>{person.full_name}</Text>
                    )}
                  </View>
                  <Pressable
                    style={lumoStyles.addButton}
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
                <Text style={lumoStyles.noResults}>
                  No new users found. Try another username.
                </Text>
              )}
            </View>
          )}

          <View style={lumoStyles.listHeading}>
            <View>
              <Text style={lumoStyles.sectionTitle}>All members</Text>
              <Text style={lumoStyles.sectionHint}>
                People who belong to this channel
              </Text>
            </View>
            <View style={lumoStyles.countBadge}>
              <Text style={lumoStyles.countText}>{subscribers.length}</Text>
            </View>
          </View>

          {subscribers.map((member) => {
            const username = member.profile?.username ?? 'member';
            const isSelf = member.user_id === me;
            const isOwner = member.role === 'owner';

            return (
              <View key={member.user_id} style={lumoStyles.memberRow}>
                <Avatar
                  uri={member.profile?.avatar_url}
                  name={username}
                  size={43}
                />
                <View style={lumoStyles.memberCopy}>
                  <Text style={lumoStyles.personName}>
                    {member.profile?.full_name || username}
                    {isSelf ? ' · You' : ''}
                  </Text>
                  <Text style={lumoStyles.personHint}>
                    @{username}
                  </Text>
                  <Text style={lumoStyles.roleText}>
                    {member.role.toUpperCase()}
                  </Text>
                </View>

                {(myRole === 'owner' || isDeveloper) && !isSelf && !isOwner && (
                  <View style={lumoStyles.actions}>
                    <Pressable
                      style={lumoStyles.actionButton}
                      onPress={() => void changeRole(member)}
                      disabled={!!busyId}
                    >
                      <Text style={lumoStyles.actionText}>
                        {member.role === 'admin' ? 'Demote' : 'Make admin'}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[
                        lumoStyles.ownerButton,
                        confirmTransfer === member.user_id && lumoStyles.confirmButton,
                      ]}
                      onPress={() => void transferOwnership(member)}
                      disabled={!!busyId}
                    >
                      {busyId === member.user_id ? (
                        <ActivityIndicator color={colors.lime} size="small" />
                      ) : (
                        <Text style={lumoStyles.actionText}>
                          {confirmTransfer === member.user_id
                            ? 'Confirm'
                            : 'Make owner'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          {subscribers.length === 0 && (
            <View style={lumoStyles.empty}>
              <Ionicons name="people-outline" size={30} color={colors.muted} />
              <Text style={lumoStyles.emptyText}>No members yet.</Text>
            </View>
          )}

          {!!confirmTransfer && (
            <Pressable
              style={lumoStyles.cancelAction}
              onPress={() => setConfirmTransfer('')}
            >
              <Text style={lumoStyles.cancelText}>Cancel ownership transfer</Text>
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
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.accentDark },
  countText: { color: colors.lime, fontSize: 10, fontWeight: '900' },
  memberRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberCopy: { flex: 1, marginLeft: 11 },
  roleText: { color: colors.lime, fontSize: 8, fontWeight: '900', marginTop: 4, letterSpacing: 0.7 },
  actions: { alignItems: 'flex-end', gap: 5 },
  actionButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.accentDark },
  ownerButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.surfaceRaised },
  confirmButton: { borderWidth: 1, borderColor: colors.lime },
  actionText: { color: colors.lime, fontSize: 9, fontWeight: '900' },
  empty: { alignItems: 'center', paddingVertical: 35 },
  emptyText: { color: colors.muted, fontSize: 11, marginTop: 10 },
  cancelAction: { alignItems: 'center', padding: 14 },
  cancelText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
});
