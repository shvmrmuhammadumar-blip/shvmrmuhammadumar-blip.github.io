-- Restrict ban-status lookup to internal security-definer checks only.
REVOKE ALL ON FUNCTION public.is_live_user_banned(uuid) FROM PUBLIC, anon, authenticated;
