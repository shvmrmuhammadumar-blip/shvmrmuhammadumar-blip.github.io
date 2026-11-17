create table public.creator_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  account_type text not null default 'personal'
    check (account_type in ('personal', 'creator', 'business')),
  category text
    check (category is null or char_length(btrim(category)) between 2 and 60),
  contact_email text
    check (contact_email is null or char_length(btrim(contact_email)) <= 254),
  website_url text
    check (website_url is null or char_length(btrim(website_url)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_settings enable row level security;
create policy "Users manage their own creator settings"
  on public.creator_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.creator_settings to authenticated;
revoke all on public.creator_settings from anon, public;

create table public.creator_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 1200),
  content_type text not null default 'post'
    check (content_type in ('post', 'video', 'story', 'live')),
  scheduled_at timestamptz,
  status text not null default 'idea'
    check (status in ('idea', 'planned', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index creator_plans_user_status_schedule_idx
  on public.creator_plans (user_id, status, scheduled_at);
create index creator_plans_user_created_idx
  on public.creator_plans (user_id, created_at desc);
alter table public.creator_plans enable row level security;
create policy "Users manage their own creator plans"
  on public.creator_plans for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.creator_plans to authenticated;
revoke all on public.creator_plans from anon, public;

create table public.creator_content_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('post', 'story')),
  content_id uuid not null,
  session_key text not null check (char_length(session_key) between 8 and 120),
  watch_ms integer not null default 0 check (watch_ms between 0 and 3600000),
  event_type text not null default 'open' check (event_type in ('open', 'complete')),
  occurred_at timestamptz not null default now(),
  constraint creator_content_events_not_self check (viewer_id <> owner_id)
);
create unique index creator_content_events_session_unique_idx
  on public.creator_content_events (viewer_id, content_type, content_id, session_key);
create index creator_content_events_owner_time_idx
  on public.creator_content_events (owner_id, occurred_at desc);
create index creator_content_events_owner_content_idx
  on public.creator_content_events (owner_id, content_type, content_id);
alter table public.creator_content_events enable row level security;
create policy "Creators read events for their own content"
  on public.creator_content_events for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Viewers record content they actually open"
  on public.creator_content_events for insert to authenticated
  with check (
    (select auth.uid()) = viewer_id
    and viewer_id <> owner_id
    and (
      (content_type = 'post' and exists (
        select 1 from public.posts p
        where p.id = content_id and p.user_id = owner_id
      ))
      or
      (content_type = 'story' and exists (
        select 1 from public.stories s
        where s.id = content_id and s.user_id = owner_id
      ))
    )
  );
grant select, insert on public.creator_content_events to authenticated;
revoke all on public.creator_content_events from anon, public;
