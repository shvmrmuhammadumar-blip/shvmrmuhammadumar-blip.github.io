import { supabase } from './supabase';

export type CreatorContentEvent = {
  viewer_id: string;
  content_id: string;
  content_type: 'post' | 'story';
  occurred_at: string;
  watch_ms: number;
  content_duration_ms: number;
  event_type: 'open' | 'complete';
};

export async function loadCreatorContentEvents(userId: string, since?: string | null): Promise<CreatorContentEvent[]> {
  const pageSize = 1000;
  const events: CreatorContentEvent[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('creator_content_events')
      .select('viewer_id, content_id, content_type, occurred_at, watch_ms, content_duration_ms, event_type')
      .eq('owner_id', userId)
      .eq('event_type', 'open')
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (since) query = query.gte('occurred_at', since);

    const { data, error } = await query;
    if (error) throw error;

    const page = (data ?? []) as CreatorContentEvent[];
    events.push(...page);
    if (page.length < pageSize) return events;
  }
}

export async function loadCreatorFollowerDates(userId: string, since: string): Promise<{ created_at: string }[]> {
  const pageSize = 1000;
  const dates: { created_at: string }[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .order('follower_id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []).map((row) => ({ created_at: row.created_at }));
    dates.push(...page);
    if (page.length < pageSize) return dates;
  }
}

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
    settingsResult,
    events,
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
    supabase.from('creator_settings')
      .select('account_type, category')
      .eq('user_id', userId)
      .maybeSingle(),
    loadCreatorContentEvents(userId),
  ]);

  for (const result of [postsResult, followersResult, followingResult, likesResult, settingsResult]) {
    if (result.error) throw result.error;
  }

  const eventViewers = new Set(events.map((event) => event.viewer_id));

  return {
    posts: postsResult.count ?? 0,
    followers: followersResult.count ?? 0,
    following: followingResult.count ?? 0,
    accountType: (settingsResult.data?.account_type ?? 'personal') as 'personal' | 'creator' | 'business',
    category: settingsResult.data?.category ?? null,
    likes: likesResult.count ?? 0,
    postOpens: events.filter((event) => event.content_type === 'post').length,
    storyOpens: events.filter((event) => event.content_type === 'story').length,
    uniqueViewers: eventViewers.size,
    recentPosts: postsResult.data ?? [],
  };
}

export function getPeriodStart(period: '7d' | '30d' | '90d' | 'all') {
  if (period === 'all') return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (period === '7d' ? 6 : period === '30d' ? 29 : 89));
  return date.toISOString();
}

export function formatStudioNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}
