
ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_username_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_username_check
  CHECK (
    char_length(username) BETWEEN 3 AND 64
    AND username ~ '^[a-z0-9_]+(-[a-z0-9_]+)*$'
  );

CREATE OR REPLACE FUNCTION public.create_channel(
  p_name text,
  p_username text,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_identity text;
  v_prefix text;
  v_slug text;
  v_base text;
  v_username text;
  v_suffix integer := 1;
  v_channel_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;

  SELECT COALESCE(
    NULLIF(split_part(u.email, '@', 1), ''),
    NULLIF(pr.username, ''),
    'user'
  )
  INTO v_owner_identity
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
  WHERE u.id = v_user_id;

  v_prefix := btrim(
    regexp_replace(lower(COALESCE(v_owner_identity, 'user')), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  IF v_prefix = '' THEN
    v_prefix := 'user';
  END IF;
  v_prefix := left(v_prefix, 24);

  v_slug := btrim(
    regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  IF v_slug = '' THEN
    v_slug := 'channel';
  END IF;
  v_slug := left(v_slug, 39);

  v_base := left(v_prefix || '-' || v_slug, 64);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_base, 0));

  v_username := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.channels WHERE username = v_username
  ) LOOP
    v_suffix := v_suffix + 1;
    v_username :=
      left(v_base, 64 - length(v_suffix::text) - 1)
      || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.channels(
    name, username, description, avatar_url, is_public, owner_id
  )
  VALUES (
    btrim(p_name),
    v_username,
    NULLIF(btrim(p_description), ''),
    NULLIF(btrim(p_avatar_url), ''),
    COALESCE(p_is_public, true),
    v_user_id
  )
  RETURNING id INTO v_channel_id;

  INSERT INTO public.channel_members(channel_id, user_id, role)
  VALUES (v_channel_id, v_user_id, 'owner');

  RETURN v_channel_id;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_owner_identity text;
  v_prefix text;
  v_slug text;
  v_base text;
  v_username text;
  v_suffix integer := 1;
BEGIN
  SELECT owner_id
  INTO v_owner_id
  FROM public.channels
  WHERE id = p_channel_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Channel not found';
  END IF;

  IF NOT public.is_channel_admin(p_channel_id) THEN
    RAISE EXCEPTION 'Only channel admins can update channel details';
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Invalid channel name';
  END IF;

  SELECT COALESCE(
    NULLIF(split_part(u.email, '@', 1), ''),
    NULLIF(pr.username, ''),
    'user'
  )
  INTO v_owner_identity
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
  WHERE u.id = v_owner_id;

  v_prefix := btrim(
    regexp_replace(lower(COALESCE(v_owner_identity, 'user')), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  IF v_prefix = '' THEN
    v_prefix := 'user';
  END IF;
  v_prefix := left(v_prefix, 24);

  v_slug := btrim(
    regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
  IF v_slug = '' THEN
    v_slug := 'channel';
  END IF;
  v_slug := left(v_slug, 39);

  v_base := left(v_prefix || '-' || v_slug, 64);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_base, 0));

  v_username := v_base;
  WHILE EXISTS (
    SELECT 1
    FROM public.channels
    WHERE username = v_username
      AND id <> p_channel_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_username :=
      left(v_base, 64 - length(v_suffix::text) - 1)
      || '-' || v_suffix::text;
  END LOOP;

  UPDATE public.channels
  SET name = btrim(p_name),
      username = v_username,
      description = NULLIF(btrim(p_description), ''),
      avatar_url = NULLIF(btrim(p_avatar_url), ''),
      is_public = COALESCE(p_is_public, true),
      updated_at = now()
  WHERE id = p_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_channel(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_channel(text, text, text, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_channel_details(uuid, text, text, text, text, boolean) TO authenticated;
;
