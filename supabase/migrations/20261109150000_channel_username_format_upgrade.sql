-- LUMO: Channel username format upgrade + channel deletion + avatar support
-- Format: owner_username-channel_slug (e.g. shvmrmuhammadumar-tech_news)

-- 1. Relax the username constraint to allow hyphen and longer length
ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_username_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_username_check
  CHECK (username ~ '^[a-z0-9_]{3,30}-[a-z0-9_]{1,30}$');

-- 2. Update existing channel usernames to include owner username prefix
UPDATE public.channels c
SET username = (
  SELECT p.username || '-' || c.username
  FROM public.profiles p
  WHERE p.id = c.owner_id
)
WHERE username !~ '-';

DROP FUNCTION IF EXISTS public.create_channel(text, text, text, text, boolean);

-- 3. Replace create_channel to auto-prefix owner username
CREATE OR REPLACE FUNCTION public.create_channel(
  p_name text,
  p_slug text,
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
  v_owner_username text;
  v_full_username text;
  v_channel_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;

  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9_]{1,30}$' THEN
    RAISE EXCEPTION 'Channel slug must be 1-30 lowercase letters, numbers or underscores';
  END IF;

  -- Get owner username from profiles
  SELECT username INTO v_owner_username
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_owner_username IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  v_full_username := v_owner_username || '-' || p_slug;

  -- Check combined length
  IF char_length(v_full_username) > 61 THEN
    RAISE EXCEPTION 'Combined username is too long';
  END IF;

  INSERT INTO public.channels(name, username, description, avatar_url, is_public, owner_id)
  VALUES (btrim(p_name), v_full_username, NULLIF(btrim(p_description), ''), p_avatar_url, COALESCE(p_is_public, true), v_user_id)
  RETURNING id INTO v_channel_id;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'owner');

  RETURN v_channel_id;
END;
$$;

DROP FUNCTION IF EXISTS public.update_channel_details(uuid, text, text, text, text, boolean);

-- 4. Update update_channel_details to use slug format
CREATE OR REPLACE FUNCTION public.update_channel_details(
  p_channel_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_avatar_url text,
  p_is_public boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_owner_username text;
  v_full_username text;
BEGIN
  IF NOT public.is_channel_admin(p_channel_id) THEN
    RAISE EXCEPTION 'Only channel admins can update channel details';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;

  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9_]{1,30}$' THEN
    RAISE EXCEPTION 'Invalid channel slug';
  END IF;

  -- Get owner username
  SELECT c.owner_id INTO v_owner_id FROM public.channels c WHERE c.id = p_channel_id;

  SELECT p.username INTO v_owner_username
  FROM public.profiles p
  WHERE p.id = v_owner_id;

  IF v_owner_username IS NULL THEN
    RAISE EXCEPTION 'Channel owner profile not found';
  END IF;

  v_full_username := v_owner_username || '-' || p_slug;

  UPDATE public.channels
  SET name = btrim(p_name),
      username = v_full_username,
      description = NULLIF(btrim(p_description), ''),
      avatar_url = p_avatar_url,
      is_public = COALESCE(p_is_public, true),
      updated_at = now()
  WHERE id = p_channel_id;
END;
$$;

-- 5. Add delete_channel function
CREATE OR REPLACE FUNCTION public.delete_channel(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM public.channels WHERE id = p_channel_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the channel owner can delete this channel';
  END IF;

  -- Delete all related data (cascades handle members, posts, reactions)
  DELETE FROM public.channels WHERE id = p_channel_id;
END;
$$;

-- 6. Transfer ownership: also update the channel username prefix
CREATE OR REPLACE FUNCTION public.transfer_channel_ownership(
  p_channel_id uuid,
  p_new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_owner uuid;
  v_new_owner_username text;
  v_current_username text;
  v_slug text;
BEGIN
  SELECT owner_id, username INTO v_current_owner, v_current_username
  FROM public.channels WHERE id = p_channel_id;

  IF v_current_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the channel owner can transfer ownership';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id AND user_id = p_new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must be a channel member';
  END IF;

  SELECT username INTO v_new_owner_username
  FROM public.profiles WHERE id = p_new_owner_id;

  IF v_new_owner_username IS NULL THEN
    RAISE EXCEPTION 'New owner profile not found';
  END IF;

  -- Extract slug (everything after first hyphen)
  v_slug := substring(v_current_username from position('-' in v_current_username) + 1);

  -- Update ownership
  UPDATE public.channel_members SET role = 'subscriber'
  WHERE channel_id = p_channel_id AND user_id = v_current_owner;

  UPDATE public.channel_members SET role = 'owner'
  WHERE channel_id = p_channel_id AND user_id = p_new_owner_id;

  UPDATE public.channels
  SET owner_id = p_new_owner_id,
      username = v_new_owner_username || '-' || v_slug,
      updated_at = now()
  WHERE id = p_channel_id;
END;
$$;

-- 7. Permissions for new function
REVOKE ALL ON FUNCTION public.delete_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_channel(uuid) TO authenticated;

-- Re-grant updated functions
REVOKE ALL ON FUNCTION public.create_channel(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_channel(text, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.transfer_channel_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_channel_ownership(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
