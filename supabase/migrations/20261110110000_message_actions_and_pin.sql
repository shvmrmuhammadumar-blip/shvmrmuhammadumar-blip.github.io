BEGIN;

-- Global platform Developer role
CREATE TABLE IF NOT EXISTS public.platform_roles (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role = 'developer'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_roles FROM PUBLIC, anon, authenticated;

-- Assign the global Developer role to the Lumo account
DO $$
DECLARE
  v_developer_id uuid;
BEGIN
  SELECT id INTO v_developer_id
  FROM public.profiles
  WHERE username = 'sh_umarov'
  LIMIT 1;

  IF v_developer_id IS NULL THEN
    RAISE EXCEPTION 'Lumo Developer profile sh_umarov was not found';
  END IF;

  INSERT INTO public.platform_roles(user_id, role)
  VALUES (v_developer_id, 'developer')
  ON CONFLICT (user_id) DO UPDATE SET role = 'developer';
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_developer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_roles
    WHERE user_id = auth.uid()
      AND role = 'developer'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_developer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_developer() TO authenticated;

-- Pin metadata
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

ALTER TABLE public.channel_posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

CREATE INDEX IF NOT EXISTS messages_pinned_idx
  ON public.messages(receiver_id, created_at DESC) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS group_messages_pinned_idx
  ON public.group_messages(group_id, created_at DESC) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS channel_posts_pinned_idx
  ON public.channel_posts(channel_id, created_at DESC) WHERE is_pinned = true;

-- Per-user hiding: direct messages
CREATE TABLE IF NOT EXISTS public.message_hidden_for (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- Per-user hiding: group messages
CREATE TABLE IF NOT EXISTS public.group_message_hidden_for (
  message_id uuid NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- Per-user hiding: channel posts
CREATE TABLE IF NOT EXISTS public.channel_post_hidden_for (
  post_id uuid NOT NULL REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_hidden_for_user_idx
  ON public.message_hidden_for(user_id);

CREATE INDEX IF NOT EXISTS group_message_hidden_for_user_idx
  ON public.group_message_hidden_for(user_id);

CREATE INDEX IF NOT EXISTS channel_post_hidden_for_user_idx
  ON public.channel_post_hidden_for(user_id);

ALTER TABLE public.message_hidden_for ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_message_hidden_for ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_post_hidden_for ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.message_hidden_for FROM PUBLIC, anon;
REVOKE ALL ON public.group_message_hidden_for FROM PUBLIC, anon;
REVOKE ALL ON public.channel_post_hidden_for FROM PUBLIC, anon;

GRANT SELECT, INSERT, DELETE ON public.message_hidden_for TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_message_hidden_for TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.channel_post_hidden_for TO authenticated;

-- Direct-message hide policies
DROP POLICY IF EXISTS message_hidden_for_select ON public.message_hidden_for;
CREATE POLICY message_hidden_for_select ON public.message_hidden_for
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS message_hidden_for_insert ON public.message_hidden_for;
CREATE POLICY message_hidden_for_insert ON public.message_hidden_for
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

DROP POLICY IF EXISTS message_hidden_for_delete ON public.message_hidden_for;
CREATE POLICY message_hidden_for_delete ON public.message_hidden_for
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Group-message hide policies
DROP POLICY IF EXISTS group_message_hidden_for_select ON public.group_message_hidden_for;
CREATE POLICY group_message_hidden_for_select ON public.group_message_hidden_for
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS group_message_hidden_for_insert ON public.group_message_hidden_for;
CREATE POLICY group_message_hidden_for_insert ON public.group_message_hidden_for
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.group_messages gm
    WHERE gm.id = message_id
      AND public.is_chat_group_member(gm.group_id)
  )
);

DROP POLICY IF EXISTS group_message_hidden_for_delete ON public.group_message_hidden_for;
CREATE POLICY group_message_hidden_for_delete ON public.group_message_hidden_for
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Channel-post hide policies
DROP POLICY IF EXISTS channel_post_hidden_for_select ON public.channel_post_hidden_for;
CREATE POLICY channel_post_hidden_for_select ON public.channel_post_hidden_for
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS channel_post_hidden_for_insert ON public.channel_post_hidden_for;
CREATE POLICY channel_post_hidden_for_insert ON public.channel_post_hidden_for
FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.channel_posts cp
    WHERE cp.id = post_id
      AND public.can_view_channel(cp.channel_id)
  )
);

DROP POLICY IF EXISTS channel_post_hidden_for_delete ON public.channel_post_hidden_for;
CREATE POLICY channel_post_hidden_for_delete ON public.channel_post_hidden_for
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Pin a direct message: global Developer only
CREATE OR REPLACE FUNCTION public.set_direct_message_pinned(
  p_message_id uuid,
  p_is_pinned boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid;
  v_receiver uuid;
BEGIN
  IF NOT public.is_platform_developer() THEN
    RAISE EXCEPTION 'Only the Developer can pin direct messages';
  END IF;

  SELECT sender_id, receiver_id
  INTO v_sender, v_receiver
  FROM public.messages
  WHERE id = p_message_id;

  IF NOT FOUND OR auth.uid() NOT IN (v_sender, v_receiver) THEN
    RAISE EXCEPTION 'Message not found or access denied';
  END IF;

  UPDATE public.messages
  SET is_pinned = p_is_pinned,
      pinned_by = CASE WHEN p_is_pinned THEN auth.uid() ELSE NULL END,
      pinned_at = CASE WHEN p_is_pinned THEN now() ELSE NULL END
  WHERE id = p_message_id;
END;
$$;

-- Pin a group message: Owner, Admin or Developer
CREATE OR REPLACE FUNCTION public.set_group_message_pinned(
  p_message_id uuid,
  p_is_pinned boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  SELECT group_id INTO v_group_id
  FROM public.group_messages
  WHERE id = p_message_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Group message not found';
  END IF;

  IF NOT (
    public.is_chat_group_admin(v_group_id)
    OR public.is_platform_developer()
  ) THEN
    RAISE EXCEPTION 'Only group Owner, Admin or Developer can pin messages';
  END IF;

  UPDATE public.group_messages
  SET is_pinned = p_is_pinned,
      pinned_by = CASE WHEN p_is_pinned THEN auth.uid() ELSE NULL END,
      pinned_at = CASE WHEN p_is_pinned THEN now() ELSE NULL END
  WHERE id = p_message_id;
END;
$$;

-- Pin a channel post: Owner, Admin or Developer
CREATE OR REPLACE FUNCTION public.set_channel_post_pinned(
  p_post_id uuid,
  p_is_pinned boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
BEGIN
  SELECT channel_id INTO v_channel_id
  FROM public.channel_posts
  WHERE id = p_post_id;

  IF v_channel_id IS NULL THEN
    RAISE EXCEPTION 'Channel post not found';
  END IF;

  IF NOT (
    public.is_channel_admin(v_channel_id)
    OR public.is_platform_developer()
  ) THEN
    RAISE EXCEPTION 'Only channel Owner, Admin or Developer can pin posts';
  END IF;

  UPDATE public.channel_posts
  SET is_pinned = p_is_pinned,
      pinned_by = CASE WHEN p_is_pinned THEN auth.uid() ELSE NULL END,
      pinned_at = CASE WHEN p_is_pinned THEN now() ELSE NULL END
  WHERE id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_direct_message_pinned(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_group_message_pinned(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_channel_post_pinned(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_direct_message_pinned(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_message_pinned(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_channel_post_pinned(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;