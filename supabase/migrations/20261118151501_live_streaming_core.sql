-- LUMO LIVE: session discovery, guest invitations, participants, chat and safety.
-- Media is transported by LiveKit; Supabase stores authorization and application state.

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  category text not null default 'conversation'
    check (category in ('conversation', 'music', 'creative', 'gaming', 'education', 'other')),
  audience text not null default 'public'
    check (audience in ('public', 'followers')),
  status text not null default 'starting'
    check (status in ('starting', 'live', 'ended', 'failed')),
  room_name text not null unique
    default ('lumo-' || replace(gen_random_uuid()::text, '-', '')),
  cover_url text check (cover_url is null or char_length(cover_url) <= 2000),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('starting', 'live') and ended_at is null)
      or (status in ('ended', 'failed') and ended_at is not null))
);

create index if not exists live_sessions_status_created_idx
  on public.live_sessions (status, created_at desc);

create index if not exists live_sessions_host_status_idx
  on public.live_sessions (host_id, status, created_at desc);

create index if not exists live_sessions_category_status_idx
  on public.live_sessions (category, status, created_at desc);

create table if not exists public.live_guest_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (session_id, guest_id),
  check (host_id <> guest_id)
);

create index if not exists live_guest_invites_guest_status_idx
  on public.live_guest_invites (guest_id, status, created_at desc);

create table if not exists public.live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('host', 'guest', 'viewer')),
  status text not null default 'joined'
    check (status in ('joined', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id),
  check ((status = 'joined' and left_at is null)
      or (status in ('left', 'removed') and left_at is not null))
);

create index if not exists live_participants_session_status_idx
  on public.live_participants (session_id, status, role);

create index if not exists live_participants_user_created_idx
  on public.live_participants (user_id, joined_at desc);

create table if not exists public.live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists live_chat_messages_session_created_idx
  on public.live_chat_messages (session_id, created_at desc);

create table if not exists public.live_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text not null
    check (reason in ('harassment', 'nudity', 'violence', 'hate', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 800),
  created_at timestamptz not null default now()
);

create index if not exists live_reports_session_created_idx
  on public.live_reports (session_id, created_at desc);

create table if not exists public.live_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('mute', 'remove', 'ban_from_session', 'chat_timeout')),
  created_at timestamptz not null default now(),
  unique (session_id, target_user_id, action)
);

create index if not exists live_moderation_actions_session_idx
  on public.live_moderation_actions (session_id, created_at desc);

alter table public.live_sessions enable row level security;
alter table public.live_guest_invites enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_chat_messages enable row level security;
alter table public.live_reports enable row level security;
alter table public.live_moderation_actions enable row level security;

drop policy if exists "live sessions are visible to their audience" on public.live_sessions;
create policy "live sessions are visible to their audience"
on public.live_sessions
for select
to authenticated
using (
  host_id = (select auth.uid())
  or (
    status = 'live'
    and (
      audience = 'public'
      or exists (
        select 1
        from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = live_sessions.host_id
      )
      or exists (
        select 1
        from public.live_guest_invites i
        where i.session_id = live_sessions.id
          and i.guest_id = (select auth.uid())
          and i.status = 'accepted'
      )
    )
  )
);

drop policy if exists "users can start their own live sessions" on public.live_sessions;
create policy "users can start their own live sessions"
on public.live_sessions
for insert
to authenticated
with check (
  host_id = (select auth.uid())
  and status = 'starting'
  and ended_at is null
);

drop policy if exists "hosts can update their own live sessions" on public.live_sessions;
create policy "hosts can update their own live sessions"
on public.live_sessions
for update
to authenticated
using (host_id = (select auth.uid()))
with check (host_id = (select auth.uid()));

drop policy if exists "hosts can delete unstarted or failed sessions" on public.live_sessions;
create policy "hosts can delete unstarted or failed sessions"
on public.live_sessions
for delete
to authenticated
using (
  host_id = (select auth.uid())
  and status in ('starting', 'failed')
);

drop policy if exists "live participants are visible to session members" on public.live_participants;
create policy "live participants are visible to session members"
on public.live_participants
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.live_sessions s
    where s.id = live_participants.session_id
      and (
        s.host_id = (select auth.uid())
        or (
          s.status = 'live'
          and (
            s.audience = 'public'
            or exists (
              select 1 from public.follows f
              where f.follower_id = (select auth.uid())
                and f.following_id = s.host_id
            )
            or exists (
              select 1 from public.live_guest_invites i
              where i.session_id = s.id
                and i.guest_id = (select auth.uid())
                and i.status = 'accepted'
            )
          )
        )
      )
  )
);

drop policy if exists "hosts can join their own live sessions" on public.live_participants;
create policy "hosts can join their own live sessions"
on public.live_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'host'
  and status = 'joined'
  and exists (
    select 1 from public.live_sessions s
    where s.id = session_id
      and s.host_id = (select auth.uid())
      and s.status in ('starting', 'live')
  )
);

drop policy if exists "viewers can join visible live sessions" on public.live_participants;
create policy "viewers can join visible live sessions"
on public.live_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'viewer'
  and status = 'joined'
  and exists (
    select 1 from public.live_sessions s
    where s.id = session_id
      and s.status = 'live'
      and (
        s.audience = 'public'
        or s.host_id = (select auth.uid())
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid())
            and f.following_id = s.host_id
        )
        or exists (
          select 1 from public.live_guest_invites i
          where i.session_id = s.id
            and i.guest_id = (select auth.uid())
            and i.status = 'accepted'
        )
      )
  )
);

drop policy if exists "accepted guests can join live sessions" on public.live_participants;
create policy "accepted guests can join live sessions"
on public.live_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'guest'
  and status = 'joined'
  and exists (
    select 1 from public.live_guest_invites i
    where i.session_id = session_id
      and i.guest_id = (select auth.uid())
      and i.status = 'accepted'
  )
);

drop policy if exists "participants can leave and hosts can remove participants" on public.live_participants;
create policy "participants can leave and hosts can remove participants"
on public.live_participants
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.live_sessions s
    where s.id = live_participants.session_id
      and s.host_id = (select auth.uid())
  )
);

drop policy if exists "guest invitations are visible to host and guest" on public.live_guest_invites;
create policy "guest invitations are visible to host and guest"
on public.live_guest_invites
for select
to authenticated
using (
  host_id = (select auth.uid())
  or guest_id = (select auth.uid())
);

drop policy if exists "hosts can invite guests to their sessions" on public.live_guest_invites;
create policy "hosts can invite guests to their sessions"
on public.live_guest_invites
for insert
to authenticated
with check (
  host_id = (select auth.uid())
  and status = 'pending'
  and exists (
    select 1 from public.live_sessions s
    where s.id = session_id
      and s.host_id = (select auth.uid())
      and s.status = 'live'
  )
);

drop policy if exists "guests can respond to their invitations" on public.live_guest_invites;
create policy "guests can respond to their invitations"
on public.live_guest_invites
for update
to authenticated
using (
  guest_id = (select auth.uid())
  and status = 'pending'
)
with check (
  guest_id = (select auth.uid())
  and status in ('accepted', 'declined')
);

drop policy if exists "hosts can cancel their pending invitations" on public.live_guest_invites;
create policy "hosts can cancel their pending invitations"
on public.live_guest_invites
for update
to authenticated
using (
  host_id = (select auth.uid())
  and status = 'pending'
)
with check (
  host_id = (select auth.uid())
  and status = 'cancelled'
);

drop policy if exists "hosts can delete pending guest invitations" on public.live_guest_invites;
create policy "hosts can delete pending guest invitations"
on public.live_guest_invites
for delete
to authenticated
using (
  host_id = (select auth.uid())
  and status = 'pending'
);

drop policy if exists "live chat is visible to the stream audience" on public.live_chat_messages;
create policy "live chat is visible to the stream audience"
on public.live_chat_messages
for select
to authenticated
using (
  exists (
    select 1 from public.live_sessions s
    where s.id = live_chat_messages.session_id
      and s.status = 'live'
      and (
        s.host_id = (select auth.uid())
        or s.audience = 'public'
        or exists (
          select 1 from public.follows f
          where f.follower_id = (select auth.uid())
            and f.following_id = s.host_id
        )
        or exists (
          select 1 from public.live_participants p
          where p.session_id = s.id
            and p.user_id = (select auth.uid())
            and p.status = 'joined'
        )
      )
  )
);

drop policy if exists "joined participants can send live chat messages" on public.live_chat_messages;
create policy "joined participants can send live chat messages"
on public.live_chat_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.live_participants p
    where p.session_id = session_id
      and p.user_id = (select auth.uid())
      and p.status = 'joined'
  )
);

drop policy if exists "users can report live sessions" on public.live_reports;
create policy "users can report live sessions"
on public.live_reports
for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and exists (
    select 1 from public.live_sessions s
    where s.id = session_id
      and s.status = 'live'
  )
);

drop policy if exists "reporters and stream hosts can read live reports" on public.live_reports;
create policy "reporters and stream hosts can read live reports"
on public.live_reports
for select
to authenticated
using (
  reporter_id = (select auth.uid())
  or exists (
    select 1 from public.live_sessions s
    where s.id = live_reports.session_id
      and s.host_id = (select auth.uid())
  )
);

drop policy if exists "live hosts can manage moderation actions" on public.live_moderation_actions;
create policy "live hosts can manage moderation actions"
on public.live_moderation_actions
for all
to authenticated
using (
  exists (
    select 1 from public.live_sessions s
    where s.id = live_moderation_actions.session_id
      and s.host_id = (select auth.uid())
  )
)
with check (
  moderator_id = (select auth.uid())
  and exists (
    select 1 from public.live_sessions s
    where s.id = session_id
      and s.host_id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.live_sessions to authenticated;
grant select, insert, delete on public.live_participants to authenticated;
grant select, insert, update, delete on public.live_guest_invites to authenticated;
grant select, insert on public.live_chat_messages to authenticated;
grant select, insert on public.live_reports to authenticated;
grant select, insert on public.live_moderation_actions to authenticated;
revoke all on public.live_sessions, public.live_participants, public.live_guest_invites,
  public.live_chat_messages, public.live_reports, public.live_moderation_actions
  from anon, public;

create or replace function public.set_live_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_live_sessions_updated_at on public.live_sessions;
create trigger set_live_sessions_updated_at
before update on public.live_sessions
for each row execute function public.set_live_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_sessions'
    ) then
      alter publication supabase_realtime add table public.live_sessions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_participants'
    ) then
      alter publication supabase_realtime add table public.live_participants;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_guest_invites'
    ) then
      alter publication supabase_realtime add table public.live_guest_invites;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_chat_messages'
    ) then
      alter publication supabase_realtime add table public.live_chat_messages;
    end if;
  end if;
end $$;
