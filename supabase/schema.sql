-- Lumo database schema.
-- Run this once in Supabase SQL Editor for a new project.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 30),
  full_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Posts saved by a user for their private collection.
create table public.saved_post (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create index posts_user_created_idx on public.posts (user_id, created_at desc);
create index comments_post_idx on public.comments (post_id, created_at);
create index saved_post_user_created_idx on public.saved_post (user_id, created_at desc);
create index follows_following_idx on public.follows (following_id);
create index stories_user_created_idx on public.stories (user_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_receiver_idx on public.messages (receiver_id, created_at desc);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    coalesce(
      nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
      left(split_part(coalesce(new.email, 'user'), '@', 1), 20) || substr(new.id::text, 1, 8)
    ),
    new.raw_user_meta_data ->> 'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.saved_post enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.stories enable row level security;
alter table public.messages enable row level security;

create policy "profiles are readable" on public.profiles
  for select to authenticated using (true);
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "posts are readable" on public.posts
  for select to authenticated using (true);
create policy "create own post" on public.posts
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own post" on public.posts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own post" on public.posts
  for delete to authenticated using (user_id = auth.uid());

create policy "likes are readable" on public.likes
  for select to authenticated using (true);
create policy "like as yourself" on public.likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "remove own like" on public.likes
  for delete to authenticated using (user_id = auth.uid());

create policy "read own saved posts" on public.saved_post
  for select to authenticated using (user_id = auth.uid());
create policy "save post as yourself" on public.saved_post
  for insert to authenticated with check (user_id = auth.uid());
create policy "remove own saved post" on public.saved_post
  for delete to authenticated using (user_id = auth.uid());

create policy "comments are readable" on public.comments
  for select to authenticated using (true);
create policy "comment as yourself" on public.comments
  for insert to authenticated with check (user_id = auth.uid());
create policy "delete own or on own post" on public.comments
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.posts p
      where p.id = comments.post_id and p.user_id = auth.uid()
    )
  );

create policy "follows are readable" on public.follows
  for select to authenticated using (true);
create policy "follow as yourself" on public.follows
  for insert to authenticated with check (follower_id = auth.uid());
create policy "unfollow as yourself" on public.follows
  for delete to authenticated using (follower_id = auth.uid());

create policy "stories visible for 24h" on public.stories
  for select to authenticated using (
    created_at > now() - interval '24 hours' or user_id = auth.uid()
  );
create policy "create own story" on public.stories
  for insert to authenticated with check (user_id = auth.uid());
create policy "delete own story" on public.stories
  for delete to authenticated using (user_id = auth.uid());

create policy "read own messages" on public.messages
  for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "send as yourself" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and receiver_id <> auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'messages'
    )
  then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end
$$;

insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;

create policy "images are viewable" on storage.objects
  for select using (bucket_id = 'images');
create policy "upload into own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "update own images" on storage.objects
  for update to authenticated using (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "delete own images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text
  );
