import { supabase } from './supabase';

export type StudioOverview = {
  posts: number;
  followers: number;
  following: number;
  accountType: 'personal' | 'creator' | 'business';
  category: string | null;
  likes: number;
  postOpens: number;
  storyOpens: number;
  uniqueViewers: number;
  recentPosts: {
    id: string;
    caption: string | null;
    media_type: string;
    created_at: string;
    image_url: string | null;
    video_url: string | null;
  }[];
};

export async function loadStudioOverview(userId: string): Promise<StudioOverview> {
  const [
    postsResult,
    followersResult,
    followingResult,
    likesResult,
    postEventsResult,
    storyEventsResult,
    settingsResult,
  ] = await Promise.all([
    supabase.from('posts')
      .select('id, caption, media_type, created_at, image_url, video_url', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('follows')
      .select('follower_id, created_at', { count: 'exact' })
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('follows')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', userId),
    supabase.from('likes')
      .select('post_id, posts!inner(user_id)', { count: 'exact', head: true })
      .eq('posts.user_id', userId),
    supabase.from('creator_content_events')
      .select('viewer_id, watch_ms', { count: 'exact' })
      .eq('owner_id', userId)
      .eq('content_type', 'post'),
    supabase.from('creator_content_events')
      .select('viewer_id, watch_ms', { count: 'exact' })
      .eq('owner_id', userId)
      .eq('content_type', 'story'),
    supabase.from('creator_settings')
      .select('account_type, category')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  for (const result of [postsResult, followersResult, followingResult, likesResult, postEventsResult, storyEventsResult, settingsResult]) {
    if (result.error) throw result.error;
  }

  const eventViewers = new Set<string>([
    ...(postEventsResult.data ?? []).map((event) => event.viewer_id),
    ...(storyEventsResult.data ?? []).map((event) => event.viewer_id),
  ]);

  return {
    posts: postsResult.count ?? 0,
    followers: followersResult.count ?? 0,
    following: followingResult.count ?? 0,
    accountType: (settingsResult.data?.account_type ?? 'personal') as 'personal' | 'creator' | 'business',
    category: settingsResult.data?.category ?? null,
    likes: likesResult.count ?? 0,
    postOpens: postEventsResult.count ?? 0,
    storyOpens: storyEventsResult.count ?? 0,
    uniqueViewers: eventViewers.size,
    recentPosts: postsResult.data ?? [],
  };
}

export function getPeriodStart(period: '7d' | '30d' | '90d' | 'all') {
  if (period === 'all') return null;
  const date = new Date();
  date.setDate(date.getDate() - (period === '7d' ? 7 : period === '30d' ? 30 : 90));
  return date.toISOString();
}

export function formatStudioNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}
