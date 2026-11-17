import { supabase } from './supabase';
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupMessageType = 'text' | 'image' | 'video' | 'audio' | 'file';

export type ChatGroup = Tables['chat_groups']['Row'];
export type GroupMember = Tables['group_members']['Row'];
export type GroupMessage = Tables['group_messages']['Row'];
export type GroupMessageReaction = Tables['group_message_reactions']['Row'];

export type GroupSummary = ChatGroup & {
  my_role: GroupRole;
  member_count: number;
};

export type GroupMemberWithProfile = GroupMember & {
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type GroupMessageWithSender = GroupMessage & {
  sender: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// GROUP LIST

export async function getMyGroups(userId: string): Promise<GroupSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id, role')
    .eq('user_id', userId);

  throwIfError(membershipError);

  if (!memberships?.length) return [];

  const groupIds = [...new Set(memberships.map((item) => item.group_id))];

  const { data: groups, error: groupsError } = await supabase
    .from('chat_groups')
    .select('*')
    .in('id', groupIds)
    .order('updated_at', { ascending: false });

  throwIfError(groupsError);

  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('group_id')
    .in('group_id', groupIds);

  throwIfError(membersError);

  const roleMap = new Map(
    memberships.map((item) => [item.group_id, item.role as GroupRole]),
  );

  const countMap = new Map<string, number>();

  for (const member of members ?? []) {
    countMap.set(
      member.group_id,
      (countMap.get(member.group_id) ?? 0) + 1,
    );
  }

  return (groups ?? []).map((group) => ({
    ...group,
    my_role: roleMap.get(group.id) ?? 'member',
    member_count: countMap.get(group.id) ?? 0,
  }));
}

// GROUP DETAILS

export async function getGroup(groupId: string): Promise<ChatGroup> {
  const { data, error } = await supabase
    .from('chat_groups')
    .select('*')
    .eq('id', groupId)
    .single();

  throwIfError(error);
  if (!data) throw new Error('Group not found.');
  return data;
}

export async function getGroupMembers(
  groupId: string,
): Promise<GroupMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(`
      group_id,
      user_id,
      role,
      added_by,
      joined_at,
      profile:profiles!group_members_user_id_fkey (
        id,
        username,
        full_name,
        avatar_url
      )
    `)
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });

  throwIfError(error);
  return (data ?? []) as unknown as GroupMemberWithProfile[];
}

// GROUP CREATION AND MEMBERS

export async function createGroup(input: {
  name: string;
  description?: string;
  avatarUrl?: string;
  isPublic?: boolean;
  memberIds?: string[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_chat_group', {
    p_name: input.name.trim(),
    p_description: input.description ?? '',
    p_avatar_url: input.avatarUrl ?? '',
    p_is_public: input.isPublic ?? false,
    p_member_ids: input.memberIds ?? [],
  });

  throwIfError(error);
  if (!data) throw new Error('Group creation did not return an ID.');
  return data;
}

export async function addGroupMembers(
  groupId: string,
  memberIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('add_chat_group_members', {
    p_group_id: groupId,
    p_member_ids: memberIds,
  });

  throwIfError(error);
}

export async function joinGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('join_chat_group', {
    p_group_id: groupId,
  });

  throwIfError(error);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_chat_group', {
    p_group_id: groupId,
  });

  throwIfError(error);
}

export async function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_chat_group_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });

  throwIfError(error);
}

export async function setGroupMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await supabase.rpc('set_chat_group_member_role', {
    p_group_id: groupId,
    p_user_id: userId,
    p_role: role,
  });

  throwIfError(error);
}

export async function updateGroupDetails(input: {
  groupId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  isPublic: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('update_chat_group_details', {
    p_group_id: input.groupId,
    p_name: input.name.trim(),
    p_description: input.description ?? '',
    p_avatar_url: input.avatarUrl ?? '',
    p_is_public: input.isPublic,
  });

  throwIfError(error);
}

export async function transferGroupOwnership(
  groupId: string,
  newOwnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('transfer_chat_group_ownership', {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });

  throwIfError(error);
}

// GROUP MESSAGES

export async function getGroupMessages(
  groupId: string,
  limit = 50,
): Promise<GroupMessageWithSender[]> {
  const { data, error } = await supabase
    .from('group_messages')
    .select(`
      *,
      sender:profiles!group_messages_sender_id_fkey (
        id,
        username,
        full_name,
        avatar_url
      )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(limit);

  throwIfError(error);
  return (data ?? []) as unknown as GroupMessageWithSender[];
}

export async function sendGroupMessage(input: {
  groupId: string;
  senderId: string;
  body?: string | null;
  messageType?: GroupMessageType;
  mediaPath?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  replyTo?: string | null;
}): Promise<GroupMessage> {
  const { data, error } = await supabase
    .from('group_messages')
    .insert({
      group_id: input.groupId,
      sender_id: input.senderId,
      body: input.body ?? null,
      message_type: input.messageType ?? 'text',
      media_path: input.mediaPath ?? null,
      media_mime_type: input.mediaMimeType ?? null,
      media_file_name: input.mediaFileName ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select('*')
    .single();

  throwIfError(error);
  if (!data) throw new Error('Message was not returned after sending.');
  return data;
}

export async function editGroupMessage(
  messageId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_messages')
    .update({
      body: body.trim(),
      edited_at: new Date().toISOString(),
    })
    .eq('id', messageId);

  throwIfError(error);
}

export async function deleteGroupMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('group_messages')
    .delete()
    .eq('id', messageId);

  throwIfError(error);
}

// MESSAGE REACTIONS

export async function addGroupMessageReaction(
  messageId: string,
  userId: string,
  reaction: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_message_reactions')
    .insert({
      group_message_id: messageId,
      user_id: userId,
      reaction,
    });

  throwIfError(error);
}

export async function removeGroupMessageReaction(
  messageId: string,
  userId: string,
  reaction: string,
): Promise<void> {
  const { error } = await supabase
    .from('group_message_reactions')
    .delete()
    .eq('group_message_id', messageId)
    .eq('user_id', userId)
    .eq('reaction', reaction);

  throwIfError(error);
}

// REALTIME

export function subscribeToGroupMessages(
  groupId: string,
  onChange: () => void,
) {
  return supabase
    .channel(`group-messages:${groupId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      },
      onChange,
    )
    .subscribe();
}
