begin;

drop policy if exists user_memberships_read_self_or_platform_manager on public.user_memberships;
create policy user_memberships_read_self_or_active_premium_or_manager
  on public.user_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      membership_type = 'member_premium'
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    )
    or private.has_platform_role('owner')
    or private.has_platform_role('admin')
    or private.has_platform_role('developer')
  );

revoke select on public.user_memberships from authenticated;
grant select (user_id, membership_type, starts_at, expires_at)
  on public.user_memberships to authenticated;

create or replace function public.is_user_premium(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_memberships m
    where m.user_id = p_user_id
      and m.membership_type = 'member_premium'
      and m.starts_at <= now()
      and (m.expires_at is null or m.expires_at > now())
  );
$function$;

revoke all on function public.is_user_premium(uuid) from public, anon;
grant execute on function public.is_user_premium(uuid) to authenticated;

drop function if exists public.get_my_membership();
create function public.get_my_membership()
returns table (
  membership_type text,
  starts_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    case
      when m.membership_type = 'member_premium'
        and m.starts_at <= now()
        and (m.expires_at is null or m.expires_at > now())
      then 'member_premium'
      else 'member'
    end as membership_type,
    m.starts_at,
    m.expires_at
  from (select auth.uid() as user_id) me
  left join public.user_memberships m on m.user_id = me.user_id
  where me.user_id is not null;
$function$;

revoke all on function public.get_my_membership() from public, anon;
grant execute on function public.get_my_membership() to authenticated;

notify pgrst, 'reload schema';

commit;