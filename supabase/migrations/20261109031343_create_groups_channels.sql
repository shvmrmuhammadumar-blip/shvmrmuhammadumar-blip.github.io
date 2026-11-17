-- LUMO GROUPS AND CHANNELS

CREATE TABLE public.chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text,
  avatar_url text,
  is_public boolean NOT NULL DEFAULT false,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.group_members (
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member')),
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE UNIQUE INDEX group_members_single_owner_idx
  ON public.group_members(group_id) WHERE role = 'owner';
CREATE INDEX group_members_user_idx
  ON public.group_members(user_id, joined_at DESC);
CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  message_type text NOT NULL DEFAULT 'text',
  media_path text,
  media_mime_type text,
  media_file_name text,
  reply_to uuid REFERENCES public.group_messages(id) ON DELETE SET NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_messages_content_check CHECK (
    message_type IN ('text', 'image', 'video', 'audio', 'file')
    AND char_length(COALESCE(body, '')) <= 2000
    AND (
      (message_type = 'text'
        AND char_length(btrim(COALESCE(body, ''))) BETWEEN 1 AND 2000
        AND media_path IS NULL)
      OR
      (message_type <> 'text' AND media_path IS NOT NULL)
    )
  )
);
CREATE INDEX group_messages_group_time_idx
  ON public.group_messages(group_id, created_at DESC);
CREATE TABLE public.group_message_reactions (
  group_message_id uuid NOT NULL
    REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (char_length(reaction) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_message_id, user_id, reaction)
);
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  username text NOT NULL UNIQUE
    CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  description text,
  avatar_url text,
  is_public boolean NOT NULL DEFAULT true,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.channel_members (
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'subscriber'
    CHECK (role IN ('owner', 'admin', 'subscriber')),
  notifications_enabled boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE UNIQUE INDEX channel_members_single_owner_idx
  ON public.channel_members(channel_id) WHERE role = 'owner';
CREATE INDEX channel_members_user_idx
  ON public.channel_members(user_id, joined_at DESC);
CREATE TABLE public.channel_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text,
  message_type text NOT NULL DEFAULT 'text',
  media_path text,
  media_mime_type text,
  media_file_name text,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_posts_content_check CHECK (
    message_type IN ('text', 'image', 'video', 'audio', 'file')
    AND char_length(COALESCE(body, '')) <= 2000
    AND (
      (message_type = 'text'
        AND char_length(btrim(COALESCE(body, ''))) BETWEEN 1 AND 2000
        AND media_path IS NULL)
      OR
      (message_type <> 'text' AND media_path IS NOT NULL)
    )
  )
);
CREATE INDEX channel_posts_channel_time_idx
  ON public.channel_posts(channel_id, created_at DESC);
CREATE TABLE public.channel_post_reactions (
  channel_post_id uuid NOT NULL
    REFERENCES public.channel_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL CHECK (char_length(reaction) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_post_id, user_id, reaction)
);
-- SECURITY HELPERS

CREATE OR REPLACE FUNCTION public.is_chat_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = auth.uid()
  );
$$;
CREATE OR REPLACE FUNCTION public.is_chat_group_admin(p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;
CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid()
  );
$$;
CREATE OR REPLACE FUNCTION public.is_channel_admin(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;
CREATE OR REPLACE FUNCTION public.can_view_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channels c
    WHERE c.id = p_channel_id
      AND (
        c.is_public
        OR EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        )
      )
  );
$$;
-- GROUP FUNCTIONS

CREATE OR REPLACE FUNCTION public.create_chat_group(
  p_name text,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_is_public boolean DEFAULT false,
  p_member_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Group name must be between 1 and 80 characters';
  END IF;

  IF cardinality(COALESCE(p_member_ids, '{}'::uuid[])) > 500 THEN
    RAISE EXCEPTION 'Too many group members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x(user_id)
    LEFT JOIN public.profiles p ON p.id = x.user_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more users do not exist';
  END IF;

  INSERT INTO public.chat_groups(name, description, avatar_url, is_public, owner_id)
  VALUES (btrim(p_name), NULLIF(btrim(p_description), ''), p_avatar_url, COALESCE(p_is_public, false), v_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO public.group_members(group_id, user_id, role, added_by)
  VALUES (v_group_id, v_user_id, 'owner', v_user_id);

  INSERT INTO public.group_members(group_id, user_id, role, added_by)
  SELECT DISTINCT v_group_id, x.user_id, 'member', v_user_id
  FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x(user_id)
  WHERE x.user_id <> v_user_id
  ON CONFLICT DO NOTHING;

  RETURN v_group_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.add_chat_group_members(
  p_group_id uuid,
  p_member_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chat_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can add members';
  END IF;

  IF cardinality(COALESCE(p_member_ids, '{}'::uuid[])) > 500 THEN
    RAISE EXCEPTION 'Too many members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x(user_id)
    LEFT JOIN public.profiles p ON p.id = x.user_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more users do not exist';
  END IF;

  INSERT INTO public.group_members(group_id, user_id, role, added_by)
  SELECT DISTINCT p_group_id, x.user_id, 'member', auth.uid()
  FROM unnest(COALESCE(p_member_ids, '{}'::uuid[])) AS x(user_id)
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.join_chat_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public boolean;
BEGIN
  SELECT is_public INTO v_public
  FROM public.chat_groups WHERE id = p_group_id;

  IF NOT COALESCE(v_public, false) THEN
    RAISE EXCEPTION 'This group is private or does not exist';
  END IF;

  INSERT INTO public.group_members(group_id, user_id, role)
  VALUES (p_group_id, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.leave_chat_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();

  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Transfer ownership or delete the group before leaving';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();
END;
$$;
CREATE OR REPLACE FUNCTION public.set_chat_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.chat_groups WHERE id = p_group_id;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the group owner can change admin roles';
  END IF;

  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Invalid group role';
  END IF;

  UPDATE public.group_members
  SET role = p_role
  WHERE group_id = p_group_id
    AND user_id = p_user_id
    AND role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group member not found';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_chat_group_member(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_actor_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only group admins can remove members';
  END IF;

  SELECT role INTO v_target_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF v_target_role IS NULL OR v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Member cannot be removed';
  END IF;

  IF v_actor_role = 'admin' AND v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Admins cannot remove other admins';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.update_chat_group_details(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_avatar_url text,
  p_is_public boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chat_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can update group details';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid group name';
  END IF;

  UPDATE public.chat_groups
  SET name = btrim(p_name),
      description = NULLIF(btrim(p_description), ''),
      avatar_url = p_avatar_url,
      is_public = COALESCE(p_is_public, false),
      updated_at = now()
  WHERE id = p_group_id;
END;
$$;
-- CHANNEL FUNCTIONS

CREATE OR REPLACE FUNCTION public.create_channel(
  p_name text,
  p_username text,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_channel_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;

  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 lowercase letters, numbers or underscores';
  END IF;

  INSERT INTO public.channels(name, username, description, avatar_url, is_public, owner_id)
  VALUES (btrim(p_name), p_username, NULLIF(btrim(p_description), ''), p_avatar_url, COALESCE(p_is_public, true), v_user_id)
  RETURNING id INTO v_channel_id;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'owner');

  RETURN v_channel_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.join_channel(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_public boolean;
BEGIN
  SELECT is_public INTO v_public
  FROM public.channels WHERE id = p_channel_id;

  IF NOT COALESCE(v_public, false) THEN
    RAISE EXCEPTION 'This channel is private or does not exist';
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (p_channel_id, auth.uid(), 'subscriber')
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.leave_channel(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role
  FROM public.channel_members
  WHERE channel_id = p_channel_id AND user_id = auth.uid();

  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Transfer ownership or delete the channel before leaving';
  END IF;

  DELETE FROM public.channel_members
  WHERE channel_id = p_channel_id AND user_id = auth.uid();
END;
$$;
CREATE OR REPLACE FUNCTION public.add_channel_subscribers(
  p_channel_id uuid,
  p_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_channel_admin(p_channel_id) THEN
    RAISE EXCEPTION 'Only channel admins can add subscribers';
  END IF;

  IF cardinality(COALESCE(p_user_ids, '{}'::uuid[])) > 500 THEN
    RAISE EXCEPTION 'Too many subscribers';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_user_ids, '{}'::uuid[])) AS x(user_id)
    LEFT JOIN public.profiles p ON p.id = x.user_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more users do not exist';
  END IF;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  SELECT DISTINCT p_channel_id, x.user_id, 'subscriber'
  FROM unnest(COALESCE(p_user_ids, '{}'::uuid[])) AS x(user_id)
  ON CONFLICT DO NOTHING;
END;
$$;
CREATE OR REPLACE FUNCTION public.set_channel_member_role(
  p_channel_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.channels WHERE id = p_channel_id;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the channel owner can change admin roles';
  END IF;

  IF p_role NOT IN ('admin', 'subscriber') THEN
    RAISE EXCEPTION 'Invalid channel role';
  END IF;

  UPDATE public.channel_members
  SET role = p_role
  WHERE channel_id = p_channel_id
    AND user_id = p_user_id
    AND role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel member not found';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.update_channel_details(
  p_channel_id uuid,
  p_name text,
  p_username text,
  p_description text,
  p_avatar_url text,
  p_is_public boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_channel_admin(p_channel_id) THEN
    RAISE EXCEPTION 'Only channel admins can update channel details';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80
     OR p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Invalid channel name or username';
  END IF;

  UPDATE public.channels
  SET name = btrim(p_name),
      username = p_username,
      description = NULLIF(btrim(p_description), ''),
      avatar_url = p_avatar_url,
      is_public = COALESCE(p_is_public, true),
      updated_at = now()
  WHERE id = p_channel_id;
END;
$$;
-- ROW LEVEL SECURITY

ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_groups_read
  ON public.chat_groups FOR SELECT TO authenticated
  USING (is_public OR public.is_chat_group_member(id));
CREATE POLICY chat_groups_delete
  ON public.chat_groups FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY group_members_read
  ON public.group_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_group_member(group_id));
CREATE POLICY group_members_delete
  ON public.group_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (public.is_chat_group_admin(group_id) AND role <> 'owner')
  );
CREATE POLICY group_messages_read
  ON public.group_messages FOR SELECT TO authenticated
  USING (public.is_chat_group_member(group_id));
CREATE POLICY group_messages_send
  ON public.group_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_group_member(group_id)
  );
CREATE POLICY group_messages_edit_own
  ON public.group_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND public.is_chat_group_member(group_id))
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_group_member(group_id));
CREATE POLICY group_messages_delete
  ON public.group_messages FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.is_chat_group_admin(group_id)
  );
CREATE POLICY group_message_reactions_read
  ON public.group_message_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_messages gm
      WHERE gm.id = group_message_id
        AND public.is_chat_group_member(gm.group_id)
    )
  );
CREATE POLICY group_message_reactions_add
  ON public.group_message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.group_messages gm
      WHERE gm.id = group_message_id
        AND public.is_chat_group_member(gm.group_id)
    )
  );
CREATE POLICY group_message_reactions_remove
  ON public.group_message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY channels_read
  ON public.channels FOR SELECT TO authenticated
  USING (is_public OR public.is_channel_member(id));
CREATE POLICY channels_delete
  ON public.channels FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY channel_members_read
  ON public.channel_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_channel_member(channel_id));
CREATE POLICY channel_members_delete
  ON public.channel_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (public.is_channel_admin(channel_id) AND role <> 'owner')
  );
CREATE POLICY channel_posts_read
  ON public.channel_posts FOR SELECT TO authenticated
  USING (public.can_view_channel(channel_id));
CREATE POLICY channel_posts_publish
  ON public.channel_posts FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_channel_admin(channel_id)
  );
CREATE POLICY channel_posts_edit_own
  ON public.channel_posts FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.is_channel_admin(channel_id)
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_channel_admin(channel_id)
  );
CREATE POLICY channel_posts_delete
  ON public.channel_posts FOR DELETE TO authenticated
  USING (public.is_channel_admin(channel_id));
CREATE POLICY channel_post_reactions_read
  ON public.channel_post_reactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_posts cp
      WHERE cp.id = channel_post_id
        AND public.can_view_channel(cp.channel_id)
    )
  );
CREATE POLICY channel_post_reactions_add
  ON public.channel_post_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.channel_posts cp
      WHERE cp.id = channel_post_id
        AND public.is_channel_member(cp.channel_id)
    )
  );
CREATE POLICY channel_post_reactions_remove
  ON public.channel_post_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());
-- TABLE PERMISSIONS

GRANT SELECT, DELETE ON public.chat_groups TO authenticated;
GRANT SELECT, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_message_reactions TO authenticated;
GRANT SELECT, DELETE ON public.channels TO authenticated;
GRANT SELECT, DELETE ON public.channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.channel_post_reactions TO authenticated;
-- FUNCTION PERMISSIONS

REVOKE ALL ON FUNCTION public.is_chat_group_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_chat_group_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_channel_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_channel_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_group_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_chat_group(text, text, text, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_chat_group_members(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_chat_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_chat_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_chat_group_member_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_chat_group_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_chat_group_details(uuid, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_channel(text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_channel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_channel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_channel_subscribers(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_channel_member_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_chat_group(text, text, text, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_chat_group_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_group_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_chat_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_group_details(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_channel(text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_channel_subscribers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_channel_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) TO authenticated;
-- REALTIME

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['group_messages', 'channel_posts', 'group_members', 'channel_members']
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
    END LOOP;
  END IF;
END;
$$;
-- SECURITY FIX: only group owners and admins can remove members.
CREATE OR REPLACE FUNCTION public.remove_chat_group_member(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
BEGIN
  SELECT role INTO v_actor_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();

  IF v_actor_role IS DISTINCT FROM 'owner'
     AND v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only group admins can remove members';
  END IF;

  SELECT role INTO v_target_role
  FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF v_target_role IS NULL OR v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Member cannot be removed';
  END IF;

  IF v_actor_role = 'admin' AND v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Admins cannot remove other admins';
  END IF;

  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;
-- SECURITY: restrict who can remove group and channel administrators.
DROP POLICY IF EXISTS group_members_delete ON public.group_members;
CREATE POLICY group_members_delete
  ON public.group_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (role = 'member' AND public.is_chat_group_admin(group_id))
    OR (
      role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.group_members owner_member
        WHERE owner_member.group_id = group_members.group_id
          AND owner_member.user_id = auth.uid()
          AND owner_member.role = 'owner'
      )
    )
  );
DROP POLICY IF EXISTS channel_members_delete ON public.channel_members;
CREATE POLICY channel_members_delete
  ON public.channel_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (role = 'subscriber' AND public.is_channel_admin(channel_id))
    OR (
      role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.channel_members owner_member
        WHERE owner_member.channel_id = channel_members.channel_id
          AND owner_member.user_id = auth.uid()
          AND owner_member.role = 'owner'
      )
    )
  );
-- OWNERSHIP TRANSFER

CREATE OR REPLACE FUNCTION public.transfer_chat_group_ownership(
  p_group_id uuid,
  p_new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_owner_id IS NULL OR p_new_owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid new group owner';
  END IF;

  PERFORM 1 FROM public.chat_groups
  WHERE id = p_group_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the group owner can transfer ownership';
  END IF;

  PERFORM 1 FROM public.group_members
  WHERE group_id = p_group_id AND user_id = p_new_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New owner must already be a group member';
  END IF;

  UPDATE public.group_members
  SET role = 'admin'
  WHERE group_id = p_group_id AND user_id = auth.uid();

  UPDATE public.group_members
  SET role = 'owner'
  WHERE group_id = p_group_id AND user_id = p_new_owner_id;

  UPDATE public.chat_groups
  SET owner_id = p_new_owner_id, updated_at = now()
  WHERE id = p_group_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.transfer_channel_ownership(
  p_channel_id uuid,
  p_new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_owner_id IS NULL OR p_new_owner_id = auth.uid() THEN
    RAISE EXCEPTION 'Invalid new channel owner';
  END IF;

  PERFORM 1 FROM public.channels
  WHERE id = p_channel_id AND owner_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the channel owner can transfer ownership';
  END IF;

  PERFORM 1 FROM public.channel_members
  WHERE channel_id = p_channel_id AND user_id = p_new_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'New owner must already be a channel member';
  END IF;

  UPDATE public.channel_members
  SET role = 'admin'
  WHERE channel_id = p_channel_id AND user_id = auth.uid();

  UPDATE public.channel_members
  SET role = 'owner'
  WHERE channel_id = p_channel_id AND user_id = p_new_owner_id;

  UPDATE public.channels
  SET owner_id = p_new_owner_id, updated_at = now()
  WHERE id = p_channel_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_chat_group_ownership(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_channel_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_chat_group_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_channel_ownership(uuid, uuid) TO authenticated;
-- PRIVATE STORAGE FOR GROUP AND CHANNEL MEDIA

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('community-media', 'community-media', false, 52428800)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "community media read" ON storage.objects;
CREATE POLICY "community media read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'community-media'
    AND array_length(storage.foldername(name), 1) = 3
    AND (
      (
        (storage.foldername(name))[1] = 'groups'
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id::text = (storage.foldername(name))[2]
            AND gm.user_id = auth.uid()
        )
      )
      OR
      (
        (storage.foldername(name))[1] = 'channels'
        AND EXISTS (
          SELECT 1 FROM public.channels c
          WHERE c.id::text = (storage.foldername(name))[2]
            AND (
              c.is_public
              OR EXISTS (
                SELECT 1 FROM public.channel_members cm
                WHERE cm.channel_id = c.id
                  AND cm.user_id = auth.uid()
              )
            )
        )
      )
    )
  );
DROP POLICY IF EXISTS "community media upload" ON storage.objects;
CREATE POLICY "community media upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-media'
    AND array_length(storage.foldername(name), 1) = 3
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND (
      (
        (storage.foldername(name))[1] = 'groups'
        AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id::text = (storage.foldername(name))[2]
            AND gm.user_id = auth.uid()
        )
      )
      OR
      (
        (storage.foldername(name))[1] = 'channels'
        AND EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id::text = (storage.foldername(name))[2]
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
      )
    )
  );
DROP POLICY IF EXISTS "community media delete" ON storage.objects;
CREATE POLICY "community media delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-media'
    AND array_length(storage.foldername(name), 1) = 3
    AND (
      (
        (storage.foldername(name))[1] = 'groups'
        AND (
          (storage.foldername(name))[3] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id::text = (storage.foldername(name))[2]
              AND gm.user_id = auth.uid()
              AND gm.role IN ('owner', 'admin')
          )
        )
      )
      OR
      (
        (storage.foldername(name))[1] = 'channels'
        AND EXISTS (
          SELECT 1 FROM public.channel_members cm
          WHERE cm.channel_id::text = (storage.foldername(name))[2]
            AND cm.user_id = auth.uid()
            AND cm.role IN ('owner', 'admin')
        )
      )
    )
  );
-- SECURITY FIX: owner checks without recursive RLS policy queries.

CREATE OR REPLACE FUNCTION public.is_chat_group_owner(p_group_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;
CREATE OR REPLACE FUNCTION public.is_channel_owner(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;
REVOKE ALL ON FUNCTION public.is_chat_group_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_channel_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_chat_group_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_owner(uuid) TO authenticated;
DROP POLICY IF EXISTS group_members_delete ON public.group_members;
CREATE POLICY group_members_delete
  ON public.group_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (role = 'member' AND public.is_chat_group_admin(group_id))
    OR (role = 'admin' AND public.is_chat_group_owner(group_id))
  );
DROP POLICY IF EXISTS channel_members_delete ON public.channel_members;
CREATE POLICY channel_members_delete
  ON public.channel_members FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'owner')
    OR (role = 'subscriber' AND public.is_channel_admin(channel_id))
    OR (role = 'admin' AND public.is_channel_owner(channel_id))
  );
GRANT EXECUTE ON FUNCTION public.remove_chat_group_member(uuid, uuid) TO authenticated;
-- Restrict existing SECURITY DEFINER RPC functions.

REVOKE EXECUTE ON FUNCTION public.edit_own_message(uuid, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_own_message(uuid, text)
TO authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_messages_read(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(uuid)
TO authenticated;
-- Trigger-only functions must not be callable through the Data API.

REVOKE EXECUTE ON FUNCTION public.handle_new_user()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_follow()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_post_comment()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_post_like()
FROM PUBLIC, anon, authenticated;
-- FINAL PRIVILEGE HARDENING

REVOKE ALL ON TABLE
  public.chat_groups,
  public.group_members,
  public.group_messages,
  public.group_message_reactions,
  public.channels,
  public.channel_members,
  public.channel_posts,
  public.channel_post_reactions
FROM anon, PUBLIC, authenticated;
GRANT SELECT, DELETE ON public.chat_groups TO authenticated;
GRANT SELECT, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.group_message_reactions TO authenticated;
GRANT SELECT, DELETE ON public.channels TO authenticated;
GRANT SELECT, DELETE ON public.channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.channel_post_reactions TO authenticated;
-- Remove default anon execution from all new RPC/helper functions.

REVOKE ALL ON FUNCTION public.is_chat_group_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_chat_group_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_channel_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_channel_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_channel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_chat_group_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_channel_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_chat_group(text, text, text, boolean, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_chat_group_members(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_chat_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_chat_group(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_chat_group_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_chat_group_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_chat_group_details(uuid, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_chat_group_ownership(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_channel(text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_channel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_channel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_channel_subscribers(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_channel_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_channel_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_group_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_group_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_chat_group(text, text, text, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_chat_group_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_chat_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_group_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_chat_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_group_details(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_chat_group_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_channel(text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_channel_subscribers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_channel_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_channel_ownership(uuid, uuid) TO authenticated;
