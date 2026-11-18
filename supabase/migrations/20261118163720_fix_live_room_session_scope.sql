-- Fix cross-session authorization in the two legacy LIVE INSERT policies.
-- Scope every membership/invitation check to the exact live session being written.

drop policy if exists "joined participants can send live chat messages"
  on public.live_chat_messages;

create policy "joined participants can send live chat messages"
on public.live_chat_messages
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.live_participants p
    where p.session_id = live_chat_messages.session_id
      and p.user_id = (select auth.uid())
      and p.status = 'joined'
  )
);

drop policy if exists "accepted guests can join live sessions"
  on public.live_participants;

create policy "accepted guests can join live sessions"
on public.live_participants
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'guest'
  and status = 'joined'
  and exists (
    select 1
    from public.live_guest_invites i
    where i.session_id = live_participants.session_id
      and i.guest_id = (select auth.uid())
      and i.status = 'accepted'
  )
);
