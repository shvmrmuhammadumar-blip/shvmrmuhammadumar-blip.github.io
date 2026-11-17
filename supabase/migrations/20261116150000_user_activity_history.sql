-- LUMO personal activity history and foreground usage tracking

create table if not exists public.user_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  target_user_id uuid references public.profiles(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  session_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists user_activity_events_user_time_idx
  on public.user_activity_events (user_id, occurred_at desc);
create index if not exists user_activity_events_user_type_time_idx
  on public.user_activity_events (user_id, event_type, occurred_at desc);
create unique index if not exists user_activity_events_view_session_uidx
  on public.user_activity_events (user_id, event_type, session_key)
  where session_key is not null
    and event_type in ('reel_watch', 'post_view', 'story_view');

alter table public.user_activity_events enable row level security;
grant select, insert on table public.user_activity_events to authenticated;

drop policy if exists "Users read their own activity history" on public.user_activity_events;
create policy "Users read their own activity history"
  on public.user_activity_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Activity rows can only be inserted by owned action triggers" on public.user_activity_events;
create policy "Activity rows can only be inserted by owned action triggers"
  on public.user_activity_events
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and pg_trigger_depth() > 0
  );

create table if not exists public.user_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_key text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  platform text not null default 'unknown',
  unique (user_id, session_key)
);

create index if not exists user_activity_sessions_user_started_idx
  on public.user_activity_sessions (user_id, started_at desc);

alter table public.user_activity_sessions enable row level security;
grant select, insert, update on table public.user_activity_sessions to authenticated;

drop policy if exists "Users read their own activity sessions" on public.user_activity_sessions;
create policy "Users read their own activity sessions"
  on public.user_activity_sessions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create their own activity sessions" on public.user_activity_sessions;
create policy "Users create their own activity sessions"
  on public.user_activity_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own activity sessions" on public.user_activity_sessions;
create policy "Users update their own activity sessions"
  on public.user_activity_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.record_user_activity(
  p_user_id uuid,
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_target_user_id uuid default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_session_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- This helper only accepts calls made from a database trigger for the
  -- authenticated user who performed the underlying action.
  if pg_trigger_depth() = 0 or auth.uid() is distinct from p_user_id then
    return;
  end if;

  insert into public.user_activity_events (
    user_id, event_type, entity_type, entity_id, target_user_id,
    related_entity_type, related_entity_id, session_key, metadata, occurred_at
  )
  values (
    p_user_id, p_event_type, p_entity_type, p_entity_id, p_target_user_id,
    p_related_entity_type, p_related_entity_id, p_session_key,
    coalesce(p_metadata, '{}'::jsonb), coalesce(p_occurred_at, now())
  )
  on conflict do nothing;
end;
$$;

grant execute on function public.record_user_activity(
  uuid, text, text, uuid, uuid, text, uuid, text, jsonb, timestamptz
) to authenticated;

create or replace function public.capture_like_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_user_id uuid;
begin
  if TG_OP = 'INSERT' then
    select p.user_id into v_target_user_id
    from public.posts p where p.id = NEW.post_id;

    perform public.record_user_activity(
      NEW.user_id, 'like', 'post', NEW.post_id, v_target_user_id,
      null, null, null, '{}'::jsonb, NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    select p.user_id into v_target_user_id
    from public.posts p where p.id = OLD.post_id;

    perform public.record_user_activity(
      OLD.user_id, 'unlike', 'post', OLD.post_id, v_target_user_id,
      null, null, null, '{}'::jsonb, now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_likes on public.likes;
create trigger user_activity_likes
  after insert or delete on public.likes
  for each row execute function public.capture_like_activity();

create or replace function public.capture_follow_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.record_user_activity(
      NEW.follower_id, 'follow', 'user', NEW.following_id, NEW.following_id,
      null, null, null, '{}'::jsonb, NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    perform public.record_user_activity(
      OLD.follower_id, 'unfollow', 'user', OLD.following_id, OLD.following_id,
      null, null, null, '{}'::jsonb, now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_follows on public.follows;
create trigger user_activity_follows
  after insert or delete on public.follows
  for each row execute function public.capture_follow_activity();

create or replace function public.capture_comment_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_target_user_id uuid;
begin
  if TG_OP = 'INSERT' then
    select p.user_id into v_target_user_id
    from public.posts p where p.id = NEW.post_id;

    perform public.record_user_activity(
      NEW.user_id, 'comment', 'post', NEW.post_id, v_target_user_id,
      'comment', NEW.id, null, jsonb_build_object('comment_type', NEW.comment_type),
      NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    select p.user_id into v_target_user_id
    from public.posts p where p.id = OLD.post_id;

    perform public.record_user_activity(
      OLD.user_id, 'delete_comment', 'post', OLD.post_id, v_target_user_id,
      'comment', OLD.id, null, '{}'::jsonb, now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_comments on public.comments;
create trigger user_activity_comments
  after insert or delete on public.comments
  for each row execute function public.capture_comment_activity();

create or replace function public.capture_post_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.record_user_activity(
      NEW.user_id, 'create_post', 'post', NEW.id, null,
      null, null, null, jsonb_build_object('media_type', NEW.media_type),
      NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    perform public.record_user_activity(
      OLD.user_id, 'delete_post', 'post', OLD.id, null,
      null, null, null, jsonb_build_object('media_type', OLD.media_type),
      now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_posts on public.posts;
create trigger user_activity_posts
  after insert or delete on public.posts
  for each row execute function public.capture_post_activity();

create or replace function public.capture_story_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.record_user_activity(
      NEW.user_id, 'create_story', 'story', NEW.id, null,
      null, null, null, '{}'::jsonb, NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    perform public.record_user_activity(
      OLD.user_id, 'delete_story', 'story', OLD.id, null,
      null, null, null, '{}'::jsonb, now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_stories on public.stories;
create trigger user_activity_stories
  after insert or delete on public.stories
  for each row execute function public.capture_story_activity();

create or replace function public.capture_saved_post_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.record_user_activity(
      NEW.user_id, 'save_post', 'post', NEW.post_id, null,
      null, null, null, '{}'::jsonb, NEW.created_at
    );
  elsif TG_OP = 'DELETE' and pg_trigger_depth() = 1 then
    perform public.record_user_activity(
      OLD.user_id, 'unsave_post', 'post', OLD.post_id, null,
      null, null, null, '{}'::jsonb, now()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_saved_posts on public.saved_post;
create trigger user_activity_saved_posts
  after insert or delete on public.saved_post
  for each row execute function public.capture_saved_post_activity();

create or replace function public.capture_message_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if NEW.forwarded_from_id is not null then
    perform public.record_user_activity(
      NEW.sender_id, 'forward', coalesce(NEW.forwarded_from_type, 'message'),
      NEW.forwarded_from_id, NEW.receiver_id, 'personal_chat', NEW.receiver_id,
      null, jsonb_build_object('destination_type', 'personal'),
      NEW.created_at
    );
  else
    perform public.record_user_activity(
      NEW.sender_id, 'send_message', 'message', NEW.id, NEW.receiver_id,
      'personal_chat', NEW.receiver_id,
      null, jsonb_build_object('message_type', NEW.message_type),
      NEW.created_at
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_messages on public.messages;
create trigger user_activity_messages
  after insert on public.messages
  for each row execute function public.capture_message_activity();

create or replace function public.capture_group_message_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if NEW.forwarded_from_id is not null then
    perform public.record_user_activity(
      NEW.sender_id, 'forward', coalesce(NEW.forwarded_from_type, 'message'),
      NEW.forwarded_from_id, null, 'group', NEW.group_id,
      null, jsonb_build_object('destination_type', 'group'),
      NEW.created_at
    );
  else
    perform public.record_user_activity(
      NEW.sender_id, 'send_group_message', 'group_message', NEW.id, null,
      'group', NEW.group_id, null, '{}'::jsonb, NEW.created_at
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_group_messages on public.group_messages;
create trigger user_activity_group_messages
  after insert on public.group_messages
  for each row execute function public.capture_group_message_activity();

create or replace function public.capture_channel_post_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if NEW.forwarded_from_id is not null then
    perform public.record_user_activity(
      NEW.sender_id, 'forward', coalesce(NEW.forwarded_from_type, 'message'),
      NEW.forwarded_from_id, null, 'channel', NEW.channel_id,
      null, jsonb_build_object('destination_type', 'channel'),
      NEW.created_at
    );
  else
    perform public.record_user_activity(
      NEW.sender_id, 'publish_channel_post', 'channel_post', NEW.id, null,
      'channel', NEW.channel_id, null, '{}'::jsonb, NEW.created_at
    );
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_channel_posts on public.channel_posts;
create trigger user_activity_channel_posts
  after insert on public.channel_posts
  for each row execute function public.capture_channel_post_activity();

create or replace function public.capture_content_view_activity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_media_type text;
begin
  if NEW.viewer_id = NEW.owner_id then
    return null;
  end if;

  if NEW.content_type = 'story' and NEW.event_type = 'open' then
    perform public.record_user_activity(
      NEW.viewer_id, 'story_view', 'story', NEW.content_id, NEW.owner_id,
      null, null, NEW.session_key,
      jsonb_build_object('watch_ms', NEW.watch_ms),
      NEW.occurred_at
    );
  elsif NEW.content_type = 'post' then
    select p.media_type into v_media_type
    from public.posts p where p.id = NEW.content_id;

    if v_media_type = 'video' and NEW.watch_ms > 0 then
      perform public.record_user_activity(
        NEW.viewer_id, 'reel_watch', 'post', NEW.content_id, NEW.owner_id,
        null, null, NEW.session_key,
        jsonb_build_object(
          'watch_ms', NEW.watch_ms,
          'duration_ms', NEW.content_duration_ms,
          'completed', NEW.event_type = 'complete'
        ),
        NEW.occurred_at
      );
    elsif v_media_type is distinct from 'video'
      and NEW.event_type = 'open'
      and NEW.watch_ms = 0
      and TG_OP = 'INSERT' then
      perform public.record_user_activity(
        NEW.viewer_id, 'post_view', 'post', NEW.content_id, NEW.owner_id,
        null, null, NEW.session_key, '{}'::jsonb, NEW.occurred_at
      );
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists user_activity_content_views on public.creator_content_events;
create trigger user_activity_content_views
  after insert or update of watch_ms, event_type on public.creator_content_events
  for each row execute function public.capture_content_view_activity();

-- Backfill activity that can still be proven from existing durable rows.
-- Deleted likes/follows and historical app foreground time cannot be reconstructed.
insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, target_user_id, occurred_at
)
select l.user_id, 'like', 'post', l.post_id, p.user_id, l.created_at
from public.likes l
join public.posts p on p.id = l.post_id;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, target_user_id,
  related_entity_type, related_entity_id, metadata, occurred_at
)
select c.user_id, 'comment', 'post', c.post_id, p.user_id,
       'comment', c.id, jsonb_build_object('comment_type', c.comment_type), c.created_at
from public.comments c
join public.posts p on p.id = c.post_id;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, target_user_id, occurred_at
)
select f.follower_id, 'follow', 'user', f.following_id, f.following_id, f.created_at
from public.follows f;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, metadata, occurred_at
)
select p.user_id, 'create_post', 'post', p.id,
       jsonb_build_object('media_type', p.media_type), p.created_at
from public.posts p;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, occurred_at
)
select s.user_id, 'create_story', 'story', s.id, s.created_at
from public.stories s;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, occurred_at
)
select s.user_id, 'save_post', 'post', s.post_id, s.created_at
from public.saved_post s;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, target_user_id,
  related_entity_type, related_entity_id, metadata, occurred_at
)
select m.sender_id, 'forward', coalesce(m.forwarded_from_type, 'message'),
       m.forwarded_from_id, m.receiver_id, 'personal_chat', m.receiver_id,
       jsonb_build_object('destination_type', 'personal'), m.created_at
from public.messages m
where m.forwarded_from_id is not null;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id,
  related_entity_type, related_entity_id, metadata, occurred_at
)
select gm.sender_id, 'forward', coalesce(gm.forwarded_from_type, 'message'),
       gm.forwarded_from_id, 'group', gm.group_id,
       jsonb_build_object('destination_type', 'group'), gm.created_at
from public.group_messages gm
where gm.forwarded_from_id is not null;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id,
  related_entity_type, related_entity_id, metadata, occurred_at
)
select cp.sender_id, 'forward', coalesce(cp.forwarded_from_type, 'message'),
       cp.forwarded_from_id, 'channel', cp.channel_id,
       jsonb_build_object('destination_type', 'channel'), cp.created_at
from public.channel_posts cp
where cp.forwarded_from_id is not null;

insert into public.user_activity_events (
  user_id, event_type, entity_type, entity_id, target_user_id,
  session_key, metadata, occurred_at
)
select ce.viewer_id,
       case
         when ce.content_type = 'story' and ce.event_type = 'open' then 'story_view'
         when p.media_type = 'video' and ce.watch_ms > 0 then 'reel_watch'
         when ce.content_type = 'post' and p.media_type is distinct from 'video'
              and ce.event_type = 'open' and ce.watch_ms = 0 then 'post_view'
       end,
       case when ce.content_type = 'story' then 'story' else 'post' end,
       ce.content_id, ce.owner_id, ce.session_key,
       jsonb_build_object('watch_ms', ce.watch_ms, 'duration_ms', ce.content_duration_ms,
                          'completed', ce.event_type = 'complete'),
       ce.occurred_at
from public.creator_content_events ce
left join public.posts p on p.id = ce.content_id
where ce.viewer_id <> ce.owner_id
  and (
    (ce.content_type = 'story' and ce.event_type = 'open')
    or (ce.content_type = 'post' and p.media_type = 'video' and ce.watch_ms > 0)
    or (ce.content_type = 'post' and p.media_type is distinct from 'video'
        and ce.event_type = 'open' and ce.watch_ms = 0)
  )
on conflict do nothing;
