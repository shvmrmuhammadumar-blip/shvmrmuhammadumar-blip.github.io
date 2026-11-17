begin;

alter table public.comments
  add column if not exists parent_id uuid,
  add column if not exists comment_type text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime_type text,
  add column if not exists media_file_name text;

alter table public.comments
  alter column body drop not null;

alter table public.comments
  drop constraint if exists comments_body_check,
  drop constraint if exists comments_content_check,
  drop constraint if exists comments_type_check,
  drop constraint if exists comments_parent_same_post_fkey,
  drop constraint if exists comments_id_post_id_key;

alter table public.comments
  add constraint comments_type_check
    check (comment_type in ('text', 'image', 'sticker')),
  add constraint comments_content_check
    check (
      char_length(coalesce(body, '')) <= 1000
      and (
        (
          comment_type = 'text'
          and char_length(btrim(coalesce(body, ''))) between 1 and 1000
          and media_path is null
          and media_mime_type is null
          and media_file_name is null
        )
        or
        (
          comment_type = 'sticker'
          and char_length(btrim(coalesce(body, ''))) between 1 and 1000
          and media_path is null
          and media_mime_type is null
          and media_file_name is null
        )
        or
        (
          comment_type = 'image'
          and media_path is not null
        )
      )
    ),
  add constraint comments_id_post_id_key unique (id, post_id);

alter table public.comments
  add constraint comments_parent_same_post_fkey
  foreign key (parent_id, post_id)
  references public.comments (id, post_id)
  on delete cascade;

create index if not exists comments_post_parent_created_idx
  on public.comments (post_id, parent_id, created_at);

commit;