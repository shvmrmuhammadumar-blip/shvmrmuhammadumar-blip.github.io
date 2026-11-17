create or replace function public.grant_platform_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.has_platform_role('owner')
    or private.has_platform_role('admin')
  ) then
    raise exception 'Only an Owner or Admin can assign platform roles';
  end if;

  if p_role not in ('owner', 'developer', 'admin') then
    raise exception 'Unsupported platform role';
  end if;

  insert into public.platform_roles (user_id, role, granted_by)
  values (p_user_id, p_role, (select auth.uid()))
  on conflict (user_id, role) do nothing;
end;
$function$;

create or replace function public.revoke_platform_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  owner_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.has_platform_role('owner')
    or private.has_platform_role('admin')
  ) then
    raise exception 'Only an Owner or Admin can revoke platform roles';
  end if;

  if p_role not in ('owner', 'developer', 'admin') then
    raise exception 'Unsupported platform role';
  end if;

  if p_role = 'owner' then
    select count(*) into owner_count
    from public.platform_roles
    where role = 'owner';

    if owner_count <= 1 then
      raise exception 'The last Owner role cannot be removed';
    end if;
  end if;

  delete from public.platform_roles
  where user_id = p_user_id
    and role = p_role;
end;
$function$;