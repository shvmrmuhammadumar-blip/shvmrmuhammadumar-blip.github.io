BEGIN;

-- 1. Post image/video media support
ALTER TABLE public.posts
  ALTER COLUMN image_url DROP NOT NULL;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_file_name text;

-- Keep existing image storage paths for forwarding
UPDATE public.posts
SET media_path = regexp_replace(
  split_part(image_url, '/storage/v1/object/public/images/', 2),
  '\?.*$',
  ''
)
WHERE media_path IS NULL
  AND image_url LIKE '%/storage/v1/object/public/images/%';

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_media_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_media_type_check
  CHECK (
    (media_type = 'image' AND image_url IS NOT NULL AND video_url IS NULL)
    OR
    (media_type = 'video' AND image_url IS NULL AND video_url IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS posts_media_type_created_at_idx
  ON public.posts (media_type, created_at DESC);

-- 2. Allow forwarding posts as a source
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_forwarded_from_type_check;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_forwarded_from_type_check
  CHECK (
    forwarded_from_type IS NULL
    OR forwarded_from_type IN ('personal', 'group', 'channel', 'post')
  );

ALTER TABLE public.group_messages
  DROP CONSTRAINT IF EXISTS group_messages_forwarded_from_type_check;

ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_forwarded_from_type_check
  CHECK (
    forwarded_from_type IS NULL
    OR forwarded_from_type IN ('personal', 'group', 'channel', 'post')
  );

ALTER TABLE public.channel_posts
  DROP CONSTRAINT IF EXISTS channel_posts_forwarded_from_type_check;

ALTER TABLE public.channel_posts
  ADD CONSTRAINT channel_posts_forwarded_from_type_check
  CHECK (
    forwarded_from_type IS NULL
    OR forwarded_from_type IN ('personal', 'group', 'channel', 'post')
  );

-- 3. Developer can publish only in channels they belong to
CREATE OR REPLACE FUNCTION public.can_publish_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.channel_members cm
      WHERE cm.channel_id = p_channel_id
        AND cm.user_id = auth.uid()
        AND (
          cm.role IN ('owner', 'admin')
          OR public.is_platform_developer()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_publish_channel(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_publish_channel(uuid)
  TO authenticated;

DROP POLICY IF EXISTS channel_posts_publish
  ON public.channel_posts;

CREATE POLICY channel_posts_publish
  ON public.channel_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_publish_channel(channel_id)
  );

-- 4. Keep group uploads unchanged; allow channel Developers
-- to upload only when they are members of that channel.
DROP POLICY IF EXISTS "community media upload"
  ON storage.objects;

CREATE POLICY "community media upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'community-media'
    AND array_length(storage.foldername(name), 1) = 3
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND (
      (
        (storage.foldername(name))[1] = 'groups'
        AND EXISTS (
          SELECT 1
          FROM public.group_members gm
          WHERE gm.group_id::text = (storage.foldername(objects.name))[2]
            AND gm.user_id = auth.uid()
        )
      )
      OR
      (
        (storage.foldername(name))[1] = 'channels'
        AND EXISTS (
          SELECT 1
          FROM public.channel_members cm
          WHERE cm.channel_id::text = (storage.foldername(objects.name))[2]
            AND cm.user_id = auth.uid()
            AND (
              cm.role IN ('owner', 'admin')
              OR public.is_platform_developer()
            )
        )
      )
    )
  );

COMMIT;
