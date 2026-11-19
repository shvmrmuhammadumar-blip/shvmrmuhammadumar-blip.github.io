-- Allow platform Developers to inspect all active LIVE rooms and enter them as viewers.
DROP POLICY IF EXISTS "live sessions are visible to their audience" ON public.live_sessions;
CREATE POLICY "live sessions are visible to their audience" ON public.live_sessions FOR SELECT TO authenticated USING (
  host_id = (SELECT auth.uid()) OR public.is_platform_developer() OR (
    status = 'live' AND (audience = 'public'
      OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = (SELECT auth.uid()) AND f.following_id = live_sessions.host_id)
      OR EXISTS (SELECT 1 FROM public.live_guest_invites i WHERE i.session_id = live_sessions.id AND i.guest_id = (SELECT auth.uid()) AND i.status = 'accepted'))));
DROP POLICY IF EXISTS "live participants are visible to session members" ON public.live_participants;
CREATE POLICY "live participants are visible to session members" ON public.live_participants FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR public.is_platform_developer() OR EXISTS (
    SELECT 1 FROM public.live_sessions s WHERE s.id = live_participants.session_id AND (
      s.host_id = (SELECT auth.uid()) OR (s.status = 'live' AND (s.audience = 'public'
        OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = (SELECT auth.uid()) AND f.following_id = s.host_id)
        OR EXISTS (SELECT 1 FROM public.live_guest_invites i WHERE i.session_id = s.id AND i.guest_id = (SELECT auth.uid()) AND i.status = 'accepted'))))));
DROP POLICY IF EXISTS "viewers can join visible live sessions" ON public.live_participants;
CREATE POLICY "viewers can join visible live sessions" ON public.live_participants FOR INSERT TO authenticated WITH CHECK (
  user_id = (SELECT auth.uid()) AND role = 'viewer' AND status = 'joined' AND EXISTS (
    SELECT 1 FROM public.live_sessions s WHERE s.id = session_id AND s.status = 'live' AND (
      public.is_platform_developer() OR s.audience = 'public' OR s.host_id = (SELECT auth.uid())
      OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = (SELECT auth.uid()) AND f.following_id = s.host_id)
      OR EXISTS (SELECT 1 FROM public.live_guest_invites i WHERE i.session_id = s.id AND i.guest_id = (SELECT auth.uid()) AND i.status = 'accepted'))));
REVOKE ALL ON FUNCTION public.is_live_user_banned(uuid) FROM PUBLIC, anon, authenticated;
