alter table public.stories
  alter column image_url drop not null;

alter table public.stories
  add column if not exists video_url text,
  add column if not exists media_type text not null default 'image',
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_file_name text;

alter table public.stories
  drop constraint if exists stories_media_source_check;

alter table public.stories
  add constraint stories_media_source_check
  check (
    (image_url is not null and video_url is null)
    or
    (image_url is null and video_url is not null)
  ) not valid;

alter table public.stories
  validate constraint stories_media_source_check;

create index if not exists stories_user_created_at_idx
  on public.stories (user_id, created_at desc);
