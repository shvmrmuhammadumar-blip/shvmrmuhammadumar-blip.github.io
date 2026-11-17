drop policy if exists "Creators read events for their own content"
  on public.creator_content_events;

drop policy if exists "Viewers read their own content session events"
  on public.creator_content_events;

create policy "Creators and viewers read related content events"
  on public.creator_content_events
  for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select auth.uid()) = viewer_id
  );
