-- A host may have only one live or starting broadcast at a time.
-- Old "starting" sessions are abandoned when camera permission or media setup fails.
update public.live_sessions
set status = 'failed',
    ended_at = coalesce(ended_at, now())
where status = 'starting'
  and created_at < now() - interval '2 minutes';

create unique index if not exists live_sessions_one_active_per_host_idx
  on public.live_sessions (host_id)
  where status in ('starting', 'live');
