begin;
drop policy if exists lumo_official_orders_customer_read_own on public.lumo_official_orders;
drop policy if exists lumo_official_orders_manager_select on public.lumo_official_orders;
create policy lumo_official_orders_manager_select
on public.lumo_official_orders for select to authenticated
using (
  created_by = (select auth.uid())
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);
commit;