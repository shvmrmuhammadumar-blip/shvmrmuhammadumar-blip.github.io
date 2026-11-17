begin;

drop policy if exists lumo_official_store_read on public.lumo_official_store;
create policy lumo_official_store_read
on public.lumo_official_store for select to anon, authenticated
using (
  is_published
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_products_read on public.lumo_official_products;
create policy lumo_official_products_read
on public.lumo_official_products for select to anon, authenticated
using (
  (
    status = 'active'
    and exists (
      select 1 from public.lumo_official_store s
      where s.id = lumo_official_products.store_id
        and s.is_published
    )
  )
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_variants_read on public.lumo_official_product_variants;
create policy lumo_official_variants_read
on public.lumo_official_product_variants for select to anon, authenticated
using (
  exists (
    select 1
    from public.lumo_official_products p
    join public.lumo_official_store s on s.id = p.store_id
    where p.id = lumo_official_product_variants.product_id
      and p.status = 'active'
      and s.is_published
  )
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_media_read on public.lumo_official_product_media;
create policy lumo_official_media_read
on public.lumo_official_product_media for select to anon, authenticated
using (
  exists (
    select 1
    from public.lumo_official_products p
    join public.lumo_official_store s on s.id = p.store_id
    where p.id = lumo_official_product_media.product_id
      and p.status = 'active'
      and s.is_published
  )
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collections_read on public.lumo_official_collections;
create policy lumo_official_collections_read
on public.lumo_official_collections for select to anon, authenticated
using (
  (
    status = 'active'
    and exists (
      select 1 from public.lumo_official_store s
      where s.id = 1 and s.is_published
    )
  )
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

drop policy if exists lumo_official_collection_products_read on public.lumo_official_collection_products;
create policy lumo_official_collection_products_read
on public.lumo_official_collection_products for select to anon, authenticated
using (
  exists (
    select 1
    from public.lumo_official_collections c
    join public.lumo_official_products p on p.id = lumo_official_collection_products.product_id
    join public.lumo_official_store s on s.id = p.store_id
    where c.id = lumo_official_collection_products.collection_id
      and c.status = 'active'
      and p.status = 'active'
      and s.is_published
  )
  or private.has_platform_role('owner')
  or private.has_platform_role('developer')
  or private.has_platform_role('admin')
);

commit;