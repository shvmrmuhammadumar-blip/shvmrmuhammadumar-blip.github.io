create table if not exists public.direct_calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete cascade,
  callee_id uuid not null references public.profiles(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'missed', 'ended')),
  room_name text not null unique,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  constraint direct_calls_distinct_participants check (caller_id <> callee_id)
);

create index if not exists direct_calls_callee_status_created_idx
  on public.direct_calls (callee_id, status, created_at desc);

create index if not exists direct_calls_caller_status_created_idx
  on public.direct_calls (caller_id, status, created_at desc);

create unique index if not exists direct_calls_one_active_outgoing_per_user
  on public.direct_calls (caller_id)
  where status in ('ringing', 'accepted');

create unique index if not exists direct_calls_one_active_incoming_per_user
  on public.direct_calls (callee_id)
  where status in ('ringing', 'accepted');

alter table public.direct_calls enable row level security;

drop policy if exists direct_calls_select_participant on public.direct_calls;
create policy direct_calls_select_participant
  on public.direct_calls
  for select
  to authenticated
  using (
    caller_id = (select auth.uid())
    or callee_id = (select auth.uid())
  );

revoke all on table public.direct_calls from anon, authenticated;
grant select on table public.direct_calls to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_calls'
  ) then
    alter publication supabase_realtime add table public.direct_calls;
  end if;
end
$$;
