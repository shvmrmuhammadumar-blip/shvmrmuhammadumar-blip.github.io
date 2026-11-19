-- Give every LUMO LIVE a short, permanent, unique eight-digit join code.
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS live_code text;

CREATE OR REPLACE FUNCTION public.generate_live_session_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE candidate text; attempt integer;
BEGIN
  PERFORM pg_advisory_xact_lock(1145982, 8);
  FOR attempt IN 1..100 LOOP
    candidate := lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    IF NOT EXISTS (SELECT 1 FROM public.live_sessions AS s WHERE s.live_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'No available eight-digit LUMO LIVE codes.';
END;
$$;

DO $$
DECLARE session_row record;
BEGIN
  FOR session_row IN SELECT id FROM public.live_sessions WHERE live_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.live_sessions SET live_code = public.generate_live_session_code() WHERE id = session_row.id;
  END LOOP;
END;
$$;

ALTER TABLE public.live_sessions ALTER COLUMN live_code SET NOT NULL;
ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_live_code_key UNIQUE (live_code),
  ADD CONSTRAINT live_sessions_live_code_format_check CHECK (live_code ~ '^[0-9]{8}$');

CREATE OR REPLACE FUNCTION public.assign_live_session_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.live_code := public.generate_live_session_code();
  ELSE
    NEW.live_code := OLD.live_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS live_sessions_assign_code ON public.live_sessions;
CREATE TRIGGER live_sessions_assign_code
BEFORE INSERT OR UPDATE OF live_code ON public.live_sessions
FOR EACH ROW EXECUTE FUNCTION public.assign_live_session_code();

REVOKE ALL ON FUNCTION public.generate_live_session_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_live_session_code() FROM PUBLIC, anon, authenticated;
