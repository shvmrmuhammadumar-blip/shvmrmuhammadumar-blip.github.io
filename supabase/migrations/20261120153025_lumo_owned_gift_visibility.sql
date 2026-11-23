begin;

drop policy if exists gift_catalog_read_authenticated on public.gift_catalog;
create policy gift_catalog_read_authenticated
  on public.gift_catalog for select to authenticated
  using (
    is_published
    or exists (
      select 1
      from public.gift_inventory i
      where i.gift_id = gift_catalog.id
        and i.owner_id = (select auth.uid())
    )
    or private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

notify pgrst, 'reload schema';

commit;
