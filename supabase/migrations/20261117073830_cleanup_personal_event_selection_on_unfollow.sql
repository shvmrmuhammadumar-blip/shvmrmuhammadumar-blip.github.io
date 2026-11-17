create or replace function public.remove_personal_event_selection_on_unfollow()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  delete from public.event_personal_selections
  where user_id = old.follower_id
    and followed_user_id = old.following_id;
  return old;
end;
$$;

revoke all on function public.remove_personal_event_selection_on_unfollow() from public, anon, authenticated;

create trigger follows_remove_event_personal_selection
after delete on public.follows
for each row
execute function public.remove_personal_event_selection_on_unfollow();
