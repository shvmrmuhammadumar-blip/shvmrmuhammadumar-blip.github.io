revoke all on function public.grant_platform_role(uuid, text) from public, anon;
revoke all on function public.revoke_platform_role(uuid, text) from public, anon;

grant execute on function public.grant_platform_role(uuid, text) to authenticated;
grant execute on function public.revoke_platform_role(uuid, text) to authenticated;
