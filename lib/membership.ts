import { supabase } from './supabase';

export type MembershipType = 'member' | 'member_premium';

export type MembershipSnapshot = {
  membership_type: MembershipType;
  starts_at: string | null;
  expires_at: string | null;
};

const membershipDb = supabase as any;

export async function isUserPremium(userId: string): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await membershipDb.rpc('is_user_premium', {
    p_user_id: userId,
  });

  if (error) throw error;
  return data === true;
}

export async function getMyMembership(): Promise<MembershipSnapshot> {
  const { data, error } = await membershipDb.rpc('get_my_membership');

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    membership_type: row?.membership_type === 'member_premium'
      ? 'member_premium'
      : 'member',
    starts_at: typeof row?.starts_at === 'string' ? row.starts_at : null,
    expires_at: typeof row?.expires_at === 'string' ? row.expires_at : null,
  };
}

export function formatMembershipDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
