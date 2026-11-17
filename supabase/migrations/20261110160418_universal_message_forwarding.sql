
alter table public.messages
  add column if not exists forwarded_from_type text,
  add column if not exists forwarded_from_id uuid,
  add column if not exists forwarded_from_sender text,
  add column if not exists forwarded_from_chat text;

alter table public.group_messages
  add column if not exists forwarded_from_type text,
  add column if not exists forwarded_from_id uuid,
  add column if not exists forwarded_from_sender text,
  add column if not exists forwarded_from_chat text;

alter table public.channel_posts
  add column if not exists forwarded_from_type text,
  add column if not exists forwarded_from_id uuid,
  add column if not exists forwarded_from_sender text,
  add column if not exists forwarded_from_chat text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_forwarded_from_type_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_forwarded_from_type_check
      check (forwarded_from_type is null or forwarded_from_type in ('personal','group','channel'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'group_messages_forwarded_from_type_check'
      and conrelid = 'public.group_messages'::regclass
  ) then
    alter table public.group_messages
      add constraint group_messages_forwarded_from_type_check
      check (forwarded_from_type is null or forwarded_from_type in ('personal','group','channel'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'channel_posts_forwarded_from_type_check'
      and conrelid = 'public.channel_posts'::regclass
  ) then
    alter table public.channel_posts
      add constraint channel_posts_forwarded_from_type_check
      check (forwarded_from_type is null or forwarded_from_type in ('personal','group','channel'));
  end if;
end;
$$;
;
