create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  category text not null default 'meetup'
    check (category in ('birthday', 'sports', 'gaming', 'study', 'meetup', 'live', 'launch', 'other')),
  description text not null default '' check (char_length(description) <= 1200),
  location text null check (location is null or char_length(location) <= 180),
  meeting_url text null check (meeting_url is null or char_length(meeting_url) <= 2000),
  cover_url text null check (cover_url is null or char_length(cover_url) <= 2000),
  starts_at timestamptz not null,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_event_expiry()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.expires_at := new.starts_at + interval '1 hour';
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.enforce_event_expiry() from public, anon, authenticated;

create trigger events_enforce_expiry
before insert or update on public.events
for each row
execute function public.enforce_event_expiry();

create index events_host_starts_at_idx on public.events (host_id, starts_at);
create index events_expires_at_idx on public.events (expires_at);

create table public.event_personal_selections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, followed_user_id),
  check (user_id <> followed_user_id)
);

create index event_personal_selections_user_idx
  on public.event_personal_selections (user_id);

create table public.event_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index event_blocks_blocked_idx on public.event_blocks (blocked_id);

create table public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_rsvps_event_status_idx
  on public.event_rsvps (event_id, status);

alter table public.events enable row level security;
alter table public.event_personal_selections enable row level security;
alter table public.event_blocks enable row level security;
alter table public.event_rsvps enable row level security;

revoke all on public.events, public.event_personal_selections, public.event_blocks, public.event_rsvps from anon;
grant select, insert, update, delete on public.events, public.event_personal_selections, public.event_blocks, public.event_rsvps to authenticated;

create policy "Events visible to followed hosts without an event block"
on public.events
for select
to authenticated
using (
  expires_at > now()
  and (
    host_id = (select auth.uid())
    or (
      exists (
        select 1
        from public.follows f
        where f.follower_id = (select auth.uid())
          and f.following_id = events.host_id
      )
      and not exists (
        select 1
        from public.event_blocks eb
        where
          (eb.blocker_id = (select auth.uid()) and eb.blocked_id = events.host_id)
          or
          (eb.blocker_id = events.host_id and eb.blocked_id = (select auth.uid()))
      )
    )
  )
);

create policy "Users create their own future events"
on public.events
for insert
to authenticated
with check (
  host_id = (select auth.uid())
  and starts_at > now()
);

create policy "Hosts update their own events"
on public.events
for update
to authenticated
using (host_id = (select auth.uid()))
with check (
  host_id = (select auth.uid())
  and starts_at > now()
);

create policy "Hosts delete their own events"
on public.events
for delete
to authenticated
using (host_id = (select auth.uid()));

create policy "Users read their own Personal selections"
on public.event_personal_selections
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users select only people they follow"
on public.event_personal_selections
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.follows f
    where f.follower_id = (select auth.uid())
      and f.following_id = event_personal_selections.followed_user_id
  )
);

create policy "Users remove their own Personal selections"
on public.event_personal_selections
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Event blocks are visible to both participants"
on public.event_blocks
for select
to authenticated
using (
  blocker_id = (select auth.uid())
  or blocked_id = (select auth.uid())
);

create policy "Users block event visibility"
on public.event_blocks
for insert
to authenticated
with check (
  blocker_id = (select auth.uid())
  and blocked_id <> (select auth.uid())
);

create policy "Users unblock event visibility"
on public.event_blocks
for delete
to authenticated
using (blocker_id = (select auth.uid()));

create policy "RSVPs visible to people who can view the event"
on public.event_rsvps
for select
to authenticated
using (
  exists (
    select 1
    from public.events e
    where e.id = event_rsvps.event_id
  )
);

create policy "Users RSVP to visible events"
on public.event_rsvps
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.events e
    where e.id = event_rsvps.event_id
      and e.host_id <> (select auth.uid())
      and e.expires_at > now()
  )
);

create policy "Users update their own RSVP"
on public.event_rsvps
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.events e
    where e.id = event_rsvps.event_id
      and e.host_id <> (select auth.uid())
      and e.expires_at > now()
  )
);

create policy "Users remove their own RSVP"
on public.event_rsvps
for delete
to authenticated
using (user_id = (select auth.uid()));

select cron.schedule(
  'lumo-expire-events',
  '* * * * *',
  'delete from public.events where expires_at <= now();'
);
