-- Allow the live host to release every pending or reserved guest request
-- when removing a guest or ending the live session.
create or replace function private.guard_live_guest_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.session_id <> old.session_id or new.requester_id <> old.requester_id then
    raise exception 'A live guest request cannot change its session or requester.';
  end if;

  if old.status = 'pending' then
    if new.status in ('accepted', 'declined') then
      if not exists (
        select 1
        from public.live_sessions s
        where s.id = old.session_id
          and s.host_id = (select auth.uid())
          and s.status = 'live'
      ) then
        raise exception 'Only the live host can respond to this request.';
      end if;
    elsif new.status = 'cancelled' then
      if old.requester_id <> (select auth.uid())
         and not exists (
           select 1
           from public.live_sessions s
           where s.id = old.session_id
             and s.host_id = (select auth.uid())
         ) then
        raise exception 'Only the requester or host can cancel this request.';
      end if;
    else
      raise exception 'Invalid live guest request transition.';
    end if;
  elsif old.status = 'accepted' and new.status = 'cancelled' then
    if old.requester_id <> (select auth.uid()) and not exists (
      select 1
      from public.live_sessions s
      where s.id = old.session_id
        and s.host_id = (select auth.uid())
    ) then
      raise exception 'Only the requester or host can release this stage reservation.';
    end if;
  else
    raise exception 'This live guest request can no longer be updated.';
  end if;

  if new.status in ('accepted', 'declined') and not exists (
    select 1
    from public.live_sessions s
    where s.id = old.session_id
      and s.host_id = (select auth.uid())
      and s.status = 'live'
  ) then
    raise exception 'Only the live host can respond to this request.';
  end if;

  if new.status = 'accepted' then
    perform 1
    from public.live_sessions s
    where s.id = new.session_id
      and s.status = 'live'
    for update;

    if not found then
      raise exception 'This live session is no longer active.';
    end if;

    if (
      select count(*)
      from public.live_participants p
      where p.session_id = new.session_id
        and p.role = 'guest'
        and p.status = 'joined'
    ) + (
      select count(*)
      from public.live_guest_requests r
      where r.session_id = new.session_id
        and r.status = 'accepted'
        and r.id <> new.id
        and not exists (
          select 1
          from public.live_participants p
          where p.session_id = r.session_id
            and p.user_id = r.requester_id
            and p.role = 'guest'
            and p.status = 'joined'
        )
    ) >= 3 then
      raise exception 'This live already has three guests on stage or reserved.';
    end if;
  end if;

  new.responded_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.guard_live_guest_request_update() from public, anon, authenticated;
