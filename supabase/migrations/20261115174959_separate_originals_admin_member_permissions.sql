begin;

drop policy if exists lumo_official_collection_products_delete on public.lumo_official_collection_products;
create policy lumo_official_collection_products_delete
on public.lumo_official_collection_products for delete to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collection_products_insert on public.lumo_official_collection_products;
create policy lumo_official_collection_products_insert
on public.lumo_official_collection_products for insert to authenticated
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collection_products_update on public.lumo_official_collection_products;
create policy lumo_official_collection_products_update
on public.lumo_official_collection_products for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collections_insert on public.lumo_official_collections;
create policy lumo_official_collections_insert
on public.lumo_official_collections for insert to authenticated
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collections_update on public.lumo_official_collections;
create policy lumo_official_collections_update
on public.lumo_official_collections for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_products_insert on public.lumo_official_products;
create policy lumo_official_products_insert
on public.lumo_official_products for insert to authenticated
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_products_update on public.lumo_official_products;
create policy lumo_official_products_update
on public.lumo_official_products for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_media_insert on public.lumo_official_product_media;
create policy lumo_official_media_insert
on public.lumo_official_product_media for insert to authenticated
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_media_update on public.lumo_official_product_media;
create policy lumo_official_media_update
on public.lumo_official_product_media for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_media_delete on public.lumo_official_product_media;
create policy lumo_official_media_delete
on public.lumo_official_product_media for delete to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_variants_insert on public.lumo_official_product_variants;
create policy lumo_official_variants_insert
on public.lumo_official_product_variants for insert to authenticated
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_variants_update on public.lumo_official_product_variants;
create policy lumo_official_variants_update
on public.lumo_official_product_variants for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_variants_delete on public.lumo_official_product_variants;
create policy lumo_official_variants_delete
on public.lumo_official_product_variants for delete to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_store_update on public.lumo_official_store;
create policy lumo_official_store_update
on public.lumo_official_store for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_orders_manager_select on public.lumo_official_orders;
create policy lumo_official_orders_manager_select
on public.lumo_official_orders for select to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_orders_manager_update on public.lumo_official_orders;
create policy lumo_official_orders_manager_update
on public.lumo_official_orders for update to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
)
with check (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_orders_manager_delete on public.lumo_official_orders;
create policy lumo_official_orders_manager_delete
on public.lumo_official_orders for delete to authenticated
using (
  private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_orders_customer_read_own on public.lumo_official_orders;
create policy lumo_official_orders_customer_read_own
on public.lumo_official_orders for select to authenticated
using (created_by = (select auth.uid()));

drop policy if exists "Official catalog managers upload media" on storage.objects;
create policy "Official catalog managers upload media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'market-media'
  and (storage.foldername(name))[2] = 'official'
  and (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  )
);

drop policy if exists "Official catalog managers update media" on storage.objects;
create policy "Official catalog managers update media"
on storage.objects for update to authenticated
using (
  bucket_id = 'market-media'
  and (storage.foldername(name))[2] = 'official'
  and (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  )
)
with check (
  bucket_id = 'market-media'
  and (storage.foldername(name))[2] = 'official'
  and (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  )
);

drop policy if exists "Official catalog managers delete media" on storage.objects;
create policy "Official catalog managers delete media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'market-media'
  and (storage.foldername(name))[2] = 'official'
  and (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  )
);

commit;