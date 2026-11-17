-- Allow one Reel watch record per Reel and app session.
-- The previous key only used (user_id, event_type, session_key), so after
-- watching one Reel all other Reels in the same session were ignored.
drop index if exists public.user_activity_events_view_session_uidx;

create unique index user_activity_events_view_session_uidx
  on public.user_activity_events (user_id, event_type, entity_id, session_key)
  where session_key is not null
    and entity_id is not null
    and event_type in ('reel_watch', 'post_view', 'story_view');
