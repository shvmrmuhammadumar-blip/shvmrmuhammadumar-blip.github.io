-- Developer-controlled LIVE access restrictions.
CREATE TABLE IF NOT EXISTS public.live_user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  duration text NOT NULL CHECK (duration IN ('1_week', '1_month', '1_year', 'permanent')),
  reason text NOT NULL DEFAULT 'LIVE rules violation' CHECK (char_length(reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, revoked_at timestamptz,
  CHECK ((duration = 'permanent' AND expires_at IS NULL) OR (duration <> 'permanent' AND expires_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS live_user_bans_active_user_idx ON public.live_user_bans (user_id, created_at DESC) WHERE revoked_at IS NULL;
ALTER TABLE public.live_user_bans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_user_bans FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.is_live_user_banned(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT EXISTS (SELECT 1 FROM public.live_user_bans b WHERE b.user_id = p_user_id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())); $$;
REVOKE ALL ON FUNCTION public.is_live_user_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_live_user_banned(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_live_user_ban(p_target_user_id uuid, p_duration text, p_reason text DEFAULT 'LIVE rules violation') RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ DECLARE v_expires_at timestamptz; BEGIN IF auth.uid() IS NULL OR NOT public.is_platform_developer() THEN RAISE EXCEPTION 'Only the LUMO Developer can issue LIVE bans.' USING ERRCODE = '42501'; END IF; IF p_target_user_id IS NULL OR p_target_user_id = auth.uid() THEN RAISE EXCEPTION 'You cannot ban this account.'; END IF; IF EXISTS (SELECT 1 FROM public.platform_roles WHERE user_id = p_target_user_id AND role = 'developer') THEN RAISE EXCEPTION 'A Developer account cannot be banned.'; END IF; IF p_duration NOT IN ('1_week', '1_month', '1_year', 'permanent') THEN RAISE EXCEPTION 'Invalid LIVE ban duration.'; END IF; v_expires_at := CASE p_duration WHEN '1_week' THEN now() + interval '7 days' WHEN '1_month' THEN now() + interval '1 month' WHEN '1_year' THEN now() + interval '1 year' ELSE NULL END; UPDATE public.live_user_bans SET revoked_at = now() WHERE user_id = p_target_user_id AND revoked_at IS NULL; INSERT INTO public.live_user_bans(user_id, banned_by, duration, reason, expires_at) VALUES (p_target_user_id, auth.uid(), p_duration, COALESCE(NULLIF(btrim(p_reason), ''), 'LIVE rules violation'), v_expires_at); RETURN v_expires_at; END; $$;
REVOKE ALL ON FUNCTION public.set_live_user_ban(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_live_user_ban(uuid, text, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.enforce_live_user_ban() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$ BEGIN IF TG_TABLE_NAME = 'live_sessions' THEN IF public.is_live_user_banned(NEW.host_id) THEN RAISE EXCEPTION 'This account is banned from LUMO LIVE until the ban expires.' USING ERRCODE = '42501'; END IF; ELSIF TG_TABLE_NAME = 'live_participants' AND NEW.status = 'joined' THEN IF public.is_live_user_banned(NEW.user_id) THEN RAISE EXCEPTION 'This account is banned from LUMO LIVE until the ban expires.' USING ERRCODE = '42501'; END IF; END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS live_sessions_enforce_ban ON public.live_sessions;
CREATE TRIGGER live_sessions_enforce_ban BEFORE INSERT ON public.live_sessions FOR EACH ROW EXECUTE FUNCTION public.enforce_live_user_ban();
DROP TRIGGER IF EXISTS live_participants_enforce_ban ON public.live_participants;
CREATE TRIGGER live_participants_enforce_ban BEFORE INSERT OR UPDATE OF status ON public.live_participants FOR EACH ROW EXECUTE FUNCTION public.enforce_live_user_ban();
REVOKE ALL ON FUNCTION public.enforce_live_user_ban() FROM PUBLIC, anon, authenticated;