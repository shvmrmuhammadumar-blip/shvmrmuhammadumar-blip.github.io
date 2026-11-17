alter table public.creator_content_events
  add column if not exists content_duration_ms integer not null default 0;

alter table public.creator_content_events
  drop constraint if exists creator_content_events_duration_ms_check;

alter table public.creator_content_events
  add constraint creator_content_events_duration_ms_check
  check (content_duration_ms between 0 and 3600000);

drop policy if exists "Viewers read their own content session events"
  on public.creator_content_events;

create policy "Viewers read their own content session events"
  on public.creator_content_events
  for select to authenticated
  using ((select auth.uid()) = viewer_id);

drop policy if exists "Viewers update their own content session events"
  on public.creator_content_events;

create policy "Viewers update their own content session events"
  on public.creator_content_events
  for update to authenticated
  using ((select auth.uid()) = viewer_id)
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

grant update on public.creator_content_events to authenticated;
