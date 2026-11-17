-- Extend existing chat-media messages to preserve generic files and audio attachments.
begin;
alter table public.messages
  add column if not exists media_file_name text;
alter table public.messages
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
commit;
