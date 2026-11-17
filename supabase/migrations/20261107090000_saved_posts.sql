CREATE TABLE IF NOT EXISTS public.saved_post (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT saved_post_pkey PRIMARY KEY (id),
  CONSTRAINT saved_post_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE,
  CONSTRAINT saved_post_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT saved_post_user_id_post_id_key UNIQUE (user_id, post_id)
);
ALTER TABLE public.saved_post ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own saved posts" ON public.saved_post;
CREATE POLICY "Users can view own saved posts"
  ON public.saved_post FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can save posts" ON public.saved_post;
CREATE POLICY "Users can save posts"
  ON public.saved_post FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove saved posts" ON public.saved_post;
CREATE POLICY "Users can remove saved posts"
  ON public.saved_post FOR DELETE
  USING (auth.uid() = user_id);
