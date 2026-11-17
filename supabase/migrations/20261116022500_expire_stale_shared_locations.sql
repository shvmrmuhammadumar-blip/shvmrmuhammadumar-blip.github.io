drop policy if exists "users can read own or followed shared locations" on public.user_locations;
create policy "users can read own or followed shared locations"
on public.user_locations
for select
to authenticated
using (
  user_id = auth.uid()
  or (
    sharing_enabled = true
    and updated_at > now() - interval '2 minutes'
    and exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = user_locations.user_id
    )
  )
);