import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { LumoModulePage, LumoPanel } from '../../components/LumoModulePage';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';
import { getMyGroups, type GroupSummary } from '../../lib/groups';
import { getMyChannels, getPublicChannels, type Channel, type ChannelSummary } from '../../lib/channels';

export default function SpacesScreen() {
  const { session } = useAuth();
  const me = session?.user?.id ?? '';
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [discover, setDiscover] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  const loadMine = useCallback(async () => {
    const [nextGroups, nextChannels] = await Promise.all([getMyGroups(me), getMyChannels(me)]);
    setGroups(nextGroups);
    setChannels(nextChannels);
    setErrorText('');
  }, [me]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    loadMine().catch((error: unknown) => {
      if (active) setErrorText(error instanceof Error ? error.message : 'Could not load your spaces.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadMine]));

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      getPublicChannels(query, 20).then((rows) => {
        if (active) setDiscover(rows.filter((row) => !channels.some((mine) => mine.id === row.id)));
      }).catch((error: unknown) => {
        if (active) setErrorText(error instanceof Error ? error.message : 'Could not search public channels.');
      });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [query, channels]);

  return (
    <LumoModulePage
      eyebrow="Lumo / Community"
      title="Spaces"
      description="Your groups and channels, together. Continue a conversation or discover public channels."
      iconName="people-circle-outline"
    >
      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={() => router.push('/groups/create')} accessibilityRole="button">
          <Ionicons name="people-outline" size={18} color={colors.accentStrong} />
          <Text style={styles.actionText}>Create group</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => router.push('/channels/create')} accessibilityRole="button">
          <Ionicons name="megaphone-outline" size={18} color={colors.accentStrong} />
          <Text style={styles.actionText}>Create channel</Text>
        </Pressable>
      </View>

      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /><Text style={styles.muted}>Loading your spaces…</Text></View> : null}
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your groups</Text><Text style={styles.count}>{groups.length}</Text></View>
      {groups.length ? groups.map((group) => (
        <Pressable key={group.id} style={styles.spaceRow} onPress={() => router.push(`/groups/${group.id}`)} accessibilityRole="button" accessibilityLabel={`Open group ${group.name}`}>
          <Avatar uri={group.avatar_url} name={group.name} size={46} />
          <View style={styles.rowCopy}><Text style={styles.name} numberOfLines={1}>{group.name}</Text><Text style={styles.muted}>{group.member_count} members · {group.my_role}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.dim} />
        </Pressable>
      )) : !loading ? <EmptyLine text="You have not joined any groups yet." /> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your channels</Text><Text style={styles.count}>{channels.length}</Text></View>
      {channels.length ? channels.map((channel) => (
        <Pressable key={channel.id} style={styles.spaceRow} onPress={() => router.push(`/channels/${channel.id}`)} accessibilityRole="button" accessibilityLabel={`Open channel ${channel.name}`}>
          <Avatar uri={channel.avatar_url} name={channel.name} size={46} />
          <View style={styles.rowCopy}><Text style={styles.name} numberOfLines={1}>{channel.name}</Text><Text style={styles.muted}>{channel.member_count} members · {channel.my_role}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.dim} />
        </Pressable>
      )) : !loading ? <EmptyLine text="You have not subscribed to any channels yet." /> : null}

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Discover public channels</Text></View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search channels" placeholderTextColor={colors.muted} style={styles.search} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search public channels" />
      {discover.length ? discover.map((channel) => (
        <Pressable key={channel.id} style={styles.spaceRow} onPress={() => router.push(`/channels/${channel.id}`)} accessibilityRole="button" accessibilityLabel={`View channel ${channel.name}`}>
          <Avatar uri={channel.avatar_url} name={channel.name} size={44} />
          <View style={styles.rowCopy}><Text style={styles.name} numberOfLines={1}>{channel.name}</Text><Text style={styles.muted}>{channel.username ? `@${channel.username}` : 'Public channel'}</Text></View>
          <Ionicons name="arrow-forward" size={18} color={colors.accent} />
        </Pressable>
      )) : <LumoPanel style={styles.discoveryEmpty}><Text style={styles.muted}>No matching public channels.</Text></LumoPanel>}
    </LumoModulePage>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <LumoPanel style={styles.empty}><Text style={styles.muted}>{text}</Text></LumoPanel>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: { flex: 1, minWidth: 145, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12 },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  loading: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 9 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  count: { color: colors.dim, fontSize: 12, fontWeight: '700' },
  spaceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  empty: { paddingVertical: 14 },
  discoveryEmpty: { padding: 14 },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.surfaceRaised, fontSize: 16 },
});
