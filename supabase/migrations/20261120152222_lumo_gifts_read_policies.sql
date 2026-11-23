begin;

drop policy if exists gift_collections_read_active on public.gift_collections;
drop policy if exists gift_collections_staff_read on public.gift_collections;
create policy gift_collections_read_anon
  on public.gift_collections for select to anon
  using (is_active);
create policy gift_collections_read_authenticated
  on public.gift_collections for select to authenticated
  using (
    is_active
    or private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_catalog_read_published on public.gift_catalog;
drop policy if exists gift_catalog_staff_read on public.gift_catalog;
create policy gift_catalog_read_anon
  on public.gift_catalog for select to anon
  using (is_published);
create policy gift_catalog_read_authenticated
  on public.gift_catalog for select to authenticated
  using (
    is_published
    or private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

notify pgrst, 'reload schema';

commit;
