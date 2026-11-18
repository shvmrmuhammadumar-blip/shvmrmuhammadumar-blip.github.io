-- LUMO LIVE: viewer-originated stage requests with a strict three-guest cap.
-- Guests request access; only the host can approve or decline.
-- Capacity is reserved at approval time and rechecked when a guest takes the stage.

create table if not exists public.live_guest_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists live_guest_requests_one_pending_idx
  on public.live_guest_requests (session_id, requester_id)
  where status = 'pending';

create index if not exists live_guest_requests_host_status_idx
  on public.live_guest_requests (session_id, status, created_at);

create index if not exists live_guest_requests_requester_idx
  on public.live_guest_requests (requester_id, created_at desc);

alter table public.live_guest_requests enable row level security;

drop policy if exists "requesters and hosts can read live guest requests" on public.live_guest_requests;
create policy "requesters and hosts can read live guest requests"
on public.live_guest_requests
for select
to authenticated
using (
  requester_id = (select auth.uid())
  or exists (
    select 1
    from public.live_sessions s
    where s.id = live_guest_requests.session_id
      and s.host_id = (select auth.uid())
  )
);

drop policy if exists "viewers can request a place on stage" on public.live_guest_requests;
create policy "viewers can request a place on stage"
on public.live_guest_requests
for insert
to authenticated
with check (
  requester_id = (select auth.uid())
  and status = 'pending'
  and responded_at is null
  and exists (
    select 1
    from public.live_sessions s
    join public.live_participants p on p.session_id = s.id
    where s.id = session_id
      and s.status = 'live'
      and s.host_id <> (select auth.uid())
      and p.user_id = (select auth.uid())
      and p.role = 'viewer'
      and p.status = 'joined'
      and (
        s.audience = 'public'
        or exists (
          select 1
          from public.follows f
          where f.follower_id = (select auth.uid())
            and f.following_id = s.host_id
        )
      )
  )
);

drop policy if exists "hosts can respond to live guest requests" on public.live_guest_requests;
create policy "hosts can respond to live guest requests"
on public.live_guest_requests
for update
to authenticated
using (
  status in ('pending', 'accepted')
  and exists (
    select 1
    from public.live_sessions s
    where s.id = live_guest_requests.session_id
      and s.host_id = (select auth.uid())
  )
)
with check (
  status in ('accepted', 'declined', 'cancelled')
  and exists (
    select 1
    from public.live_sessions s
    where s.id = live_guest_requests.session_id
      and s.host_id = (select auth.uid())
  )
);

drop policy if exists "requesters can withdraw pending stage requests" on public.live_guest_requests;
create policy "requesters can withdraw pending stage requests"
on public.live_guest_requests
for update
to authenticated
using (
  requester_id = (select auth.uid())
  and status in ('pending', 'accepted')
)
with check (
  requester_id = (select auth.uid())
  and status = 'cancelled'
);

grant select, insert, update on public.live_guest_requests to authenticated;
revoke all on public.live_guest_requests from anon, public;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.guard_live_guest_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_id <> old.session_id or new.requester_id <> old.requester_id then
    raise exception 'A live guest request cannot change its session or requester.';
  end if;

  if old.status = 'pending' then
    if new.status in ('accepted', 'declined') then
      if not exists (
        select 1
        from public.live_sessions s
        where s.id = old.session_id
          and s.host_id = (select auth.uid())
          and s.status = 'live'
      ) then
        raise exception 'Only the live host can respond to this request.';
      end if;
    elsif new.status = 'cancelled' then
      if old.requester_id <> (select auth.uid()) then
        raise exception 'Only the requester can withdraw this request.';
      end if;
    else
      raise exception 'Invalid live guest request transition.';
    end if;
  elsif old.status = 'accepted' and new.status = 'cancelled' then
    if old.requester_id <> (select auth.uid()) and not exists (
      select 1
      from public.live_sessions s
      where s.id = old.session_id
        and s.host_id = (select auth.uid())
    ) then
      raise exception 'Only the requester or host can release this stage reservation.';
    end if;
  else
    raise exception 'This live guest request can no longer be updated.';
  end if;

  if new.status in ('accepted', 'declined') and not exists (
    select 1
    from public.live_sessions s
    where s.id = old.session_id
      and s.host_id = (select auth.uid())
      and s.status = 'live'
  ) then
    raise exception 'Only the live host can respond to this request.';
  end if;

  if new.status = 'accepted' then
    -- Lock the session row so two approvals cannot reserve the same final place.
    perform 1
    from public.live_sessions s
    where s.id = new.session_id
      and s.status = 'live'
    for update;

    if not found then
      raise exception 'This live session is no longer active.';
    end if;

    if (
      select count(*)
      from public.live_participants p
      where p.session_id = new.session_id
        and p.role = 'guest'
        and p.status = 'joined'
    ) + (
      select count(*)
      from public.live_guest_requests r
      where r.session_id = new.session_id
        and r.status = 'accepted'
        and r.id <> new.id
        and not exists (
          select 1
          from public.live_participants p
          where p.session_id = r.session_id
            and p.user_id = r.requester_id
            and p.role = 'guest'
            and p.status = 'joined'
        )
    ) >= 3 then
      raise exception 'This live already has three guests on stage or reserved.';
    end if;
  end if;

  new.responded_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.guard_live_guest_request_update() from public, anon, authenticated;

drop trigger if exists guard_live_guest_request_update on public.live_guest_requests;
create trigger guard_live_guest_request_update
before update on public.live_guest_requests
for each row execute function private.guard_live_guest_request_update();

create or replace function private.guard_live_guest_participant_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  needs_capacity_check boolean := false;
begin
  if tg_op = 'INSERT' then
    needs_capacity_check := new.role = 'guest' and new.status = 'joined';
  else
    needs_capacity_check :=
      new.role = 'guest'
      and new.status = 'joined'
      and (old.role is distinct from 'guest' or old.status is distinct from 'joined');
  end if;

  if needs_capacity_check then

    perform 1
    from public.live_sessions s
    where s.id = new.session_id
      and s.status = 'live'
    for update;

    if not found then
      raise exception 'This live session is no longer active.';
    end if;

    if not exists (
      select 1
      from public.live_guest_requests r
      where r.session_id = new.session_id
        and r.requester_id = new.user_id
        and r.status = 'accepted'
    ) then
      raise exception 'The host must approve your stage request first.';
    end if;

    if (
      select count(*)
      from public.live_participants p
      where p.session_id = new.session_id
        and p.role = 'guest'
        and p.status = 'joined'
        and (tg_op = 'INSERT' or p.id <> new.id)
    ) + (
      select count(*)
      from public.live_guest_requests r
      where r.session_id = new.session_id
        and r.status = 'accepted'
        and r.requester_id <> new.user_id
        and not exists (
          select 1
          from public.live_participants p
          where p.session_id = r.session_id
            and p.user_id = r.requester_id
            and p.role = 'guest'
            and p.status = 'joined'
        )
    ) >= 3 then
      raise exception 'The live stage is full. Only three guests can join at once.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_live_guest_participant_capacity() from public, anon, authenticated;

drop trigger if exists guard_live_guest_participant_capacity on public.live_participants;
create trigger guard_live_guest_participant_capacity
before insert or update of role, status on public.live_participants
for each row execute function private.guard_live_guest_participant_capacity();

-- A viewer keeps their existing participant row when promoted to guest.
drop policy if exists "approved viewers can take the guest stage" on public.live_participants;
create policy "approved viewers can take the guest stage"
on public.live_participants
for update
to authenticated
using (
  user_id = (select auth.uid())
  and role = 'viewer'
  and status = 'joined'
)
with check (
  user_id = (select auth.uid())
  and role = 'guest'
  and status = 'joined'
  and exists (
    select 1
    from public.live_guest_requests r
    where r.session_id = live_participants.session_id
      and r.requester_id = (select auth.uid())
      and r.status = 'accepted'
  )
);

grant update on public.live_participants to authenticated;

drop policy if exists "guests can leave the live stage" on public.live_participants;
create policy "guests can leave the live stage"
on public.live_participants
for update
to authenticated
using (
  user_id = (select auth.uid())
  and role = 'guest'
  and status = 'joined'
)
with check (
  user_id = (select auth.uid())
  and role = 'guest'
  and status = 'left'
  and left_at is not null
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'live_guest_requests'
     ) then
    alter publication supabase_realtime add table public.live_guest_requests;
  end if;
end $$;
