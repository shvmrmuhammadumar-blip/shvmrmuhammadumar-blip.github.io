import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Avatar from '../Avatar';
import { colors } from '../../lib/theme';
import type { GroupMemberWithProfile } from '../../lib/groups';
import { useThemedStyles } from "../../lib/theme-styles";

type Props = {
  member: GroupMemberWithProfile;
  currentUserId?: string;
  compact?: boolean;
};

export default function GroupMemberRow({
  member,
  currentUserId,
  compact = false,
}: Props) {
  const lumoStyles = useThemedStyles(styles);
  const username = member.profile?.username ?? 'member';
  const name = member.profile?.full_name || username;

  return (
    <View style={[lumoStyles.row, compact && lumoStyles.compact]}>
      <Avatar
        uri={member.profile?.avatar_url}
        name={username}
        size={compact ? 36 : 43}
      />

      <View style={lumoStyles.copy}>
        <Text style={lumoStyles.name} numberOfLines={1}>
          {name}
          {member.user_id === currentUserId ? ' · You' : ''}
        </Text>
        <Text style={lumoStyles.username} numberOfLines={1}>
          @{username}
        </Text>
      </View>

      <View
        style={[
          lumoStyles.roleBadge,
          member.role === 'owner' && lumoStyles.ownerBadge,
          member.role === 'admin' && lumoStyles.adminBadge,
        ]}
      >
        <Text style={lumoStyles.roleText}>
          {member.role.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  compact: {
    minHeight: 52,
    paddingHorizontal: 5,
  },
  copy: {
    flex: 1,
    marginLeft: 11,
  },
  name: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  username: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 3,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
  ownerBadge: {
    backgroundColor: colors.accentDark,
  },
  adminBadge: {
    backgroundColor: colors.accentDark,
  },
  roleText: {
    color: colors.lime,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
