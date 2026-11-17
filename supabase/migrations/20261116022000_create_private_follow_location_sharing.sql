create table if not exists public.user_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading_degrees double precision check (heading_degrees is null or heading_degrees between 0 and 360),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  sharing_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists user_locations_updated_at_idx
  on public.user_locations (updated_at desc);

alter table public.user_locations enable row level security;

drop policy if exists "users can read own or followed shared locations" on public.user_locations;
create policy "users can read own or followed shared locations"
on public.user_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    sharing_enabled = true
    and exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = user_locations.user_id
    )
  )
);

drop policy if exists "users can insert own location" on public.user_locations;
create policy "users can insert own location"
on public.user_locations
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can update own location" on public.user_locations;
create policy "users can update own location"
on public.user_locations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users can delete own location" on public.user_locations;
create policy "users can delete own location"
on public.user_locations
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.user_locations to authenticated;
revoke all on public.user_locations from anon, public;

create or replace function public.set_user_location_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_user_location_updated_at on public.user_locations;
create trigger set_user_location_updated_at
before update on public.user_locations
for each row execute function public.set_user_location_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'user_locations'
     ) then
    alter publication supabase_realtime add table public.user_locations;
  end if;
end $$;

comment on table public.user_locations is
'Opt-in location sharing. RLS limits reads to the owner and followers when sharing_enabled is true. Disable sharing to immediately hide the row from followers.';