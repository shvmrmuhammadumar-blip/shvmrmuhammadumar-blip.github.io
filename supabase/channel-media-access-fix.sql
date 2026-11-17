-- Fix private community media read access.
-- The explicit objects.name qualification prevents channels.name from shadowing
-- storage.objects.name inside the channel EXISTS subquery.

DROP POLICY IF EXISTS "community media read" ON storage.objects;

CREATE POLICY "community media read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-media'
    AND array_length(storage.foldername(objects.name), 1) = 3
    AND (
      (
        (storage.foldername(objects.name))[1] = 'groups'
        AND EXISTS (
          SELECT 1
          FROM public.group_members gm
          WHERE gm.group_id::text = (storage.foldername(objects.name))[2]
            AND gm.user_id = auth.uid()
        )
      )
      OR
      (
        (storage.foldername(objects.name))[1] = 'channels'
        AND EXISTS (
          SELECT 1
          FROM public.channels c
          WHERE c.id::text = (storage.foldername(objects.name))[2]
            AND (
              c.is_public
              OR EXISTS (
                SELECT 1
                FROM public.channel_members cm
                WHERE cm.channel_id = c.id
                  AND cm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );
