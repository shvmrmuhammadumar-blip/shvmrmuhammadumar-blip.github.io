-- Repair the incremental Lumo chat schema and enable private media attachments.
-- Safe to apply to an existing Lumo database or after earlier chat migrations.
begin;
alter table public.messages
  add column if not exists message_type text default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_file_name text,
  add column if not exists edited_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists reply_to uuid,
  add column if not exists forwarded_from uuid;
update public.messages
set message_type = 'text'
where message_type is null;
alter table public.messages
  alter column message_type set default 'text',
  alter column message_type set not null,
  alter column body drop not null,
  drop constraint if exists messages_body_check,
  drop constraint if exists messages_content_check;
alter table public.messages
  add constraint messages_content_check check (
    message_type in ('text', 'image', 'video', 'audio', 'file')
    and char_length(coalesce(body, '')) <= 2000
    and (
      (
        message_type = 'text'
        and char_length(btrim(coalesce(body, ''))) between 1 and 2000
        and media_path is null
      )
      or (
        message_type in ('image', 'video', 'audio', 'file')
        and media_path is not null
      )
    )
  );
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_reply_to_fkey'
  ) then
    alter table public.messages
      add constraint messages_reply_to_fkey
      foreign key (reply_to) references public.messages(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_forwarded_from_fkey'
  ) then
    alter table public.messages
      add constraint messages_forwarded_from_fkey
      foreign key (forwarded_from) references public.messages(id) on delete set null;
  end if;
end
$$;
create index if not exists messages_read_at_idx
  on public.messages (receiver_id, read_at)
  where read_at is null;
alter table public.messages enable row level security;
alter table public.messages replica identity full;
drop policy if exists "read own messages" on public.messages;
create policy "read own messages"
  on public.messages for select to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());
drop policy if exists "send AS yourself" on public.messages;
drop policy if exists "send as yourself" on public.messages;
create policy "send as yourself"
  on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and receiver_id <> auth.uid());
drop policy if exists "delete own messages" on public.messages;
create policy "delete own messages"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid());
create or replace function public.edit_own_message(p_message_id uuid, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_at timestamptz;
begin
  if auth.uid() is null or char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Message text must contain 1 to 2000 characters';
  end if;

  update public.messages
    set body = btrim(p_body),
        edited_at = now()
    where id = p_message_id
      and sender_id = auth.uid()
      and message_type = 'text'
      and media_path is null
    returning edited_at into updated_at;

  if updated_at is null then
    raise exception 'Message was not found or cannot be edited';
  end if;

  return updated_at;
end;
$$;
revoke all on function public.edit_own_message(uuid, text) from public;
grant execute on function public.edit_own_message(uuid, text) to authenticated;
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);
grant select, insert, delete on table public.message_reactions to authenticated;
alter table public.message_reactions enable row level security;
drop policy if exists "conversation participants read message reactions"
  on public.message_reactions;
create policy "conversation participants read message reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );
drop policy if exists "conversation participants add message reactions"
  on public.message_reactions;
create policy "conversation participants add message reactions"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );
drop policy if exists "users remove own message reactions"
  on public.message_reactions;
create policy "users remove own message reactions"
  on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());
alter table public.message_reactions replica identity full;
create or replace function public.mark_messages_read(p_other_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  marked_count integer;
begin
  if auth.uid() is null or p_other_user_id = auth.uid() then
    raise exception 'Invalid conversation';
  end if;

  update public.messages
    set read_at = now()
    where sender_id = p_other_user_id
      and receiver_id = auth.uid()
      and read_at is null;

  get diagnostics marked_count = row_count;
  return marked_count;
end;
$$;
revoke all on function public.mark_messages_read(uuid) from public;
grant execute on function public.mark_messages_read(uuid) to authenticated;
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 52428800)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public,
      file_size_limit = excluded.file_size_limit;
drop policy if exists "chat media participants read attachments" on storage.objects;
create policy "chat media participants read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.messages m
      where m.media_path = name
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );
drop policy if exists "users upload own chat attachments" on storage.objects;
create policy "users upload own chat attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "users delete own chat attachments" on storage.objects;
create policy "users delete own chat attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    )
  then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'message_reactions'
    )
  then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end
$$;
notify pgrst, 'reload schema';
commit;
