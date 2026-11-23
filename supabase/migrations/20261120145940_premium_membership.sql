begin;

create table if not exists public.user_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  membership_type text not null default 'member'
    check (membership_type in ('member', 'member_premium')),
  starts_at timestamptz,
  expires_at timestamptz,
  source text not null default 'system'
    check (source in ('system', 'admin_grant', 'admin_revoke', 'payment', 'promotion')),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_memberships_period_check check (
    (membership_type = 'member' and starts_at is null and expires_at is null)
    or
    (membership_type = 'member_premium'
      and starts_at is not null
      and (expires_at is null or expires_at > starts_at))
  )
);

create index if not exists user_memberships_premium_expiry_idx
  on public.user_memberships (expires_at)
  where membership_type = 'member_premium';

create table if not exists public.user_membership_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  previous_membership_type text
    check (previous_membership_type is null or previous_membership_type in ('member', 'member_premium')),
  membership_type text not null
    check (membership_type in ('member', 'member_premium')),
  action text not null
    check (action in ('activated', 'renewed', 'revoked')),
  starts_at timestamptz,
  expires_at timestamptz,
  source text not null
    check (source in ('admin_grant', 'admin_revoke', 'payment', 'promotion')),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists user_membership_events_user_created_idx
  on public.user_membership_events (user_id, created_at desc);

alter table public.user_memberships enable row level security;
alter table public.user_membership_events enable row level security;

revoke all on public.user_memberships from public, anon, authenticated;
revoke all on public.user_membership_events from public, anon, authenticated;
grant select on public.user_memberships to authenticated;
grant select on public.user_membership_events to authenticated;

drop policy if exists user_memberships_read_self_or_platform_manager on public.user_memberships;
create policy user_memberships_read_self_or_platform_manager
  on public.user_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_platform_role('owner')
    or private.has_platform_role('admin')
    or private.has_platform_role('developer')
  );

drop policy if exists user_membership_events_read_self_or_platform_manager on public.user_membership_events;
create policy user_membership_events_read_self_or_platform_manager
  on public.user_membership_events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_platform_role('owner')
    or private.has_platform_role('admin')
    or private.has_platform_role('developer')
  );

create or replace function public.is_user_premium(p_user_id uuid)
returns boolean
language sql
stable
security definer
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
grant execute on function public.is_user_premium(uuid) to anon, authenticated;

create or replace function public.get_my_membership()
returns table (
  membership_type text,
  starts_at timestamptz,
  expires_at timestamptz,
  source text
)
language sql
stable
security definer
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
    m.expires_at,
    m.source
  from (select auth.uid() as user_id) me
  left join public.user_memberships m on m.user_id = me.user_id
  where me.user_id is not null;
$function$;

revoke all on function public.get_my_membership() from public, anon;
grant execute on function public.get_my_membership() to authenticated;

create or replace function public.set_user_membership(
  p_user_id uuid,
  p_membership_type text,
  p_expires_at timestamptz default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_previous_type text;
  v_action text;
  v_source text;
  v_starts_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.has_platform_role('owner')
    or private.has_platform_role('admin')
  ) then
    raise exception 'Only an Owner or Admin can manage Premium membership';
  end if;

  if p_user_id is null then
    raise exception 'A target user is required';
  end if;

  if p_membership_type is null or p_membership_type not in ('member', 'member_premium') then
    raise exception 'Unsupported membership type';
  end if;

  if p_membership_type = 'member_premium'
     and p_expires_at is not null
     and p_expires_at <= now() then
    raise exception 'Premium expiry must be in the future';
  end if;

  if p_membership_type = 'member' and p_expires_at is not null then
    raise exception 'Standard membership cannot have a Premium expiry';
  end if;

  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'Reason must be 500 characters or fewer';
  end if;

  select m.membership_type
    into v_previous_type
  from public.user_memberships m
  where m.user_id = p_user_id;

  if p_membership_type = 'member_premium' then
    v_starts_at := now();
    v_source := 'admin_grant';
    v_action := case
      when v_previous_type = 'member_premium'
        and exists (
          select 1
          from public.user_memberships m
          where m.user_id = p_user_id
            and m.membership_type = 'member_premium'
            and m.starts_at <= now()
            and (m.expires_at is null or m.expires_at > now())
        )
      then 'renewed'
      else 'activated'
    end;
  else
    v_starts_at := null;
    v_source := 'admin_revoke';
    v_action := 'revoked';
  end if;

  insert into public.user_memberships (
    user_id,
    membership_type,
    starts_at,
    expires_at,
    source,
    updated_by,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_membership_type,
    v_starts_at,
    p_expires_at,
    v_source,
    v_actor,
    now(),
    now()
  )
  on conflict (user_id) do update
  set membership_type = excluded.membership_type,
      starts_at = excluded.starts_at,
      expires_at = excluded.expires_at,
      source = excluded.source,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.user_membership_events (
    user_id,
    previous_membership_type,
    membership_type,
    action,
    starts_at,
    expires_at,
    source,
    actor_id,
    reason
  )
  values (
    p_user_id,
    v_previous_type,
    p_membership_type,
    v_action,
    v_starts_at,
    p_expires_at,
    v_source,
    v_actor,
    coalesce(p_reason, '')
  );
end;
$function$;

revoke all on function public.set_user_membership(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.set_user_membership(uuid, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';

commit;