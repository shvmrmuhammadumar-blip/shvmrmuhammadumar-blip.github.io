
create index if not exists event_personal_selections_followed_user_idx
  on public.event_personal_selections (followed_user_id);

create index if not exists event_rsvps_user_id_idx
  on public.event_rsvps (user_id);

drop index if exists public.event_personal_selections_user_idx;
