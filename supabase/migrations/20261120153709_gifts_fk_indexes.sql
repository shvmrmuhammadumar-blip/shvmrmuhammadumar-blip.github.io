begin;

create index if not exists gift_catalog_created_by_idx
  on public.gift_catalog (created_by);
create index if not exists gift_catalog_updated_by_idx
  on public.gift_catalog (updated_by);

create index if not exists gift_collections_created_by_idx
  on public.gift_collections (created_by);
create index if not exists gift_collections_updated_by_idx
  on public.gift_collections (updated_by);

create index if not exists gift_inventory_gift_id_idx
  on public.gift_inventory (gift_id);
create index if not exists gift_inventory_acquired_from_idx
  on public.gift_inventory (acquired_from);

create index if not exists gift_transfers_inventory_id_idx
  on public.gift_transfers (inventory_id);

commit;
