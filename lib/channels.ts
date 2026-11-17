import { supabase } from './supabase';
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type ChannelRole = 'owner' | 'admin' | 'member';
export type ChannelPostType = 'text' | 'image' | 'video' | 'audio' | 'file';

export type Channel = Tables['channels']['Row'];
export type ChannelMember = Tables['channel_members']['Row'];
export type ChannelPost = Tables['channel_posts']['Row'];
export type ChannelPostReaction = Tables['channel_post_reactions']['Row'];

export type ChannelSummary = Channel & {
  my_role: ChannelRole;
  member_count: number;
};

export type ChannelMemberWithProfile = ChannelMember & {
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type ChannelPostWithSender = ChannelPost & {
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

// MY CHANNELS

export async function getMyChannels(userId: string): Promise<ChannelSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('channel_members')
    .select('channel_id, role')
    .eq('user_id', userId);

  throwIfError(membershipError);

  if (!memberships?.length) return [];

  const channelIds = [...new Set(memberships.map((item) => item.channel_id))];

  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .in('id', channelIds)
    .order('updated_at', { ascending: false });

  throwIfError(channelsError);

  const { data: members, error: membersError } = await supabase
    .from('channel_members')
    .select('channel_id')
    .in('channel_id', channelIds);

  throwIfError(membersError);

  const roleMap = new Map(
    memberships.map((item) => [item.channel_id, item.role as ChannelRole]),
  );

  const countMap = new Map<string, number>();

  for (const member of members ?? []) {
    countMap.set(
      member.channel_id,
      (countMap.get(member.channel_id) ?? 0) + 1,
    );
  }

  return (channels ?? []).map((channel) => ({
    ...channel,
    my_role: roleMap.get(channel.id) ?? 'member',
    member_count: countMap.get(channel.id) ?? 0,
  }));
}

// PUBLIC CHANNEL DISCOVERY

export async function getPublicChannels(
  search = '',
  limit = 30,
): Promise<Channel[]> {
  let query = supabase
    .from('channels')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  const term = search.trim();

  if (term) {
    const safeTerm = term.replace(/[%_,()]/g, '');
    if (safeTerm) {
      query = query.or(
        `name.ilike.%${safeTerm}%,username.ilike.%${safeTerm}%`,
      );
    }
  }

  const { data, error } = await query;

  throwIfError(error);
  return data ?? [];
}

// CHANNEL DETAILS

export async function getChannel(channelId: string): Promise<Channel> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('id', channelId)
    .single();

  throwIfError(error);

  if (!data) throw new Error('Channel not found.');

  return data;
}

export async function getChannelByUsername(
  username: string,
): Promise<Channel | null> {
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('username', username.trim().replace(/^@/, '').toLowerCase())
    .maybeSingle();

  throwIfError(error);
  return data;
}

export async function getChannelMembers(
  channelId: string,
): Promise<ChannelMemberWithProfile[]> {
  const { data, error } = await supabase
    .from('channel_members')
    .select(`
      channel_id,
      user_id,
      role,
      notifications_enabled,
      joined_at,
      profile:profiles!channel_members_user_id_fkey (
        id,
        username,
        full_name,
        avatar_url
      )
    `)
    .eq('channel_id', channelId)
    .order('joined_at', { ascending: true });

  throwIfError(error);
  return (data ?? []) as unknown as ChannelMemberWithProfile[];
}

// CHANNEL CREATION AND SUBSCRIPTIONS

export async function getMyProfile(
  userId: string,
): Promise<{ username: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  throwIfError(error);
  return data;
}

export async function createChannel(input: {
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  isPublic?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_channel', {
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_description: input.description ?? '',
    p_avatar_url: input.avatarUrl ?? '',
    p_is_public: input.isPublic ?? true,
  });

  throwIfError(error);

  if (!data) throw new Error('Channel creation did not return an ID.');

  return data;
}

export async function joinChannel(channelId: string): Promise<void> {
  const { error } = await supabase.rpc('join_channel', {
    p_channel_id: channelId,
  });

  throwIfError(error);
}

export async function leaveChannel(channelId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_channel', {
    p_channel_id: channelId,
  });

  throwIfError(error);
}

export async function addChannelMembers(
  channelId: string,
  userIds: string[],
): Promise<void> {
  const { error } = await supabase.rpc('add_channel_subscribers', {
    p_channel_id: channelId,
    p_user_ids: userIds,
  });

  throwIfError(error);
}

export async function setChannelMemberRole(
  channelId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await supabase.rpc('set_channel_member_role', {
    p_channel_id: channelId,
    p_user_id: userId,
    p_role: role,
  });

  throwIfError(error);
}

export async function updateChannelDetails(input: {
  channelId: string;
  name: string;
  slug: string;
  description?: string;
  avatarUrl?: string;
  isPublic: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('update_channel_details', {
    p_channel_id: input.channelId,
    p_name: input.name.trim(),
    p_slug: input.slug.trim().toLowerCase(),
    p_description: input.description ?? '',
    p_avatar_url: input.avatarUrl ?? '',
    p_is_public: input.isPublic,
  });

  throwIfError(error);
}

export async function deleteChannel(channelId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_channel', {
    p_channel_id: channelId,
  });

  throwIfError(error);
}

/** Extract the slug part from a full channel username (owner-slug → slug) */
export function extractSlug(fullUsername: string): string {
  const hyphenIndex = fullUsername.indexOf('-');
  return hyphenIndex >= 0 ? fullUsername.slice(hyphenIndex + 1) : fullUsername;
}

/** Upload a channel avatar image and return its public URL */
export async function uploadChannelAvatar(
  channelId: string,
  userId: string,
  imageUri: string,
): Promise<string> {
  const fileName = `channel-avatar-${Date.now()}.jpg`;
  const storagePath = `${userId}/channels/${channelId}/${fileName}`;

  // Fetch image as blob
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage
    .from('images')
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}

export async function transferChannelOwnership(
  channelId: string,
  newOwnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('transfer_channel_ownership', {
    p_channel_id: channelId,
    p_new_owner_id: newOwnerId,
  });

  throwIfError(error);
}

// CHANNEL POSTS

export async function getChannelPosts(
  channelId: string,
  limit = 50,
): Promise<ChannelPostWithSender[]> {
  const { data, error } = await supabase
    .from('channel_posts')
    .select(`
      *,
      sender:profiles!channel_posts_sender_id_fkey (
        id,
        username,
        full_name,
        avatar_url
      )
    `)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  throwIfError(error);

  return [...(data ?? [])].reverse() as unknown as ChannelPostWithSender[];
}

export async function publishChannelPost(input: {
  channelId: string;
  senderId: string;
  body?: string | null;
  messageType?: ChannelPostType;
  mediaPath?: string | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
}): Promise<ChannelPost> {
  const { data, error } = await supabase
    .from('channel_posts')
    .insert({
      channel_id: input.channelId,
      sender_id: input.senderId,
      body: input.body ?? null,
      message_type: input.messageType ?? 'text',
      media_path: input.mediaPath ?? null,
      media_mime_type: input.mediaMimeType ?? null,
      media_file_name: input.mediaFileName ?? null,
    })
    .select('*')
    .single();

  throwIfError(error);

  if (!data) throw new Error('Channel post was not returned after publishing.');

  return data;
}

export async function editChannelPost(
  postId: string,
  senderId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from('channel_posts')
    .update({
      body: body.trim(),
      edited_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .eq('sender_id', senderId);

  throwIfError(error);
}

export async function deleteChannelPost(postId: string): Promise<void> {
  const { error } = await supabase
    .from('channel_posts')
    .delete()
    .eq('id', postId);

  throwIfError(error);
}

// POST REACTIONS

export async function addChannelPostReaction(
  postId: string,
  userId: string,
  reaction: string,
): Promise<void> {
  const { error } = await supabase
    .from('channel_post_reactions')
    .insert({
      channel_post_id: postId,
      user_id: userId,
      reaction,
    });

  throwIfError(error);
}

export async function removeChannelPostReaction(
  postId: string,
  userId: string,
  reaction: string,
): Promise<void> {
  const { error } = await supabase
    .from('channel_post_reactions')
    .delete()
    .eq('channel_post_id', postId)
    .eq('user_id', userId)
    .eq('reaction', reaction);

  throwIfError(error);
}

// REALTIME

export function subscribeToChannelPosts(
  channelId: string,
  onChange: () => void,
) {
  return supabase
    .channel(`channel-posts:${channelId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'channel_posts',
        filter: `channel_id=eq.${channelId}`,
      },
      onChange,
    )
    .subscribe();
}
