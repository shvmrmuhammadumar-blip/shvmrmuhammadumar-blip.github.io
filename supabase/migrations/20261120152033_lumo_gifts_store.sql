begin;

create table if not exists public.gift_collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  cover_path text,
  sort_order integer not null default 0,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_catalog (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid references public.gift_collections(id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 80),
  description text not null default '' check (char_length(description) <= 700),
  coin_price bigint not null check (coin_price > 0),
  rarity text not null default 'common'
    check (rarity in ('common', 'rare', 'epic', 'legendary', 'mythic')),
  asset_path text not null check (asset_path ~ '^catalog/[a-z0-9_-]+/[^/]+\.glb$'),
  preview_path text,
  asset_format text not null default 'glb' check (asset_format = 'glb'),
  model_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(model_metadata) = 'object'),
  is_featured boolean not null default false,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gift_catalog_public_order_idx
  on public.gift_catalog (is_published, sort_order, created_at desc);
create index if not exists gift_catalog_collection_idx
  on public.gift_catalog (collection_id, sort_order);

create table if not exists public.coin_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_credited bigint not null default 0 check (lifetime_credited >= 0),
  lifetime_spent bigint not null default 0 check (lifetime_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_type text not null
    check (transaction_type in ('top_up', 'gift_purchase', 'gift_refund', 'admin_adjustment')),
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reference_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint coin_transactions_user_idempotency_unique unique (user_id, idempotency_key)
);

create index if not exists coin_transactions_user_created_idx
  on public.coin_transactions (user_id, created_at desc);

create table if not exists public.gift_inventory (
  id uuid primary key default gen_random_uuid(),
  gift_id uuid not null references public.gift_catalog(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('purchase', 'gift_received', 'admin_grant')),
  acquired_from uuid references public.profiles(id) on delete set null,
  purchase_transaction_id uuid unique
    references public.coin_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists gift_inventory_owner_created_idx
  on public.gift_inventory (owner_id, created_at desc);

create table if not exists public.gift_transfers (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.gift_inventory(id) on delete restrict,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '' check (char_length(message) <= 240),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  constraint gift_transfer_not_self_check check (from_user_id <> to_user_id),
  constraint gift_transfers_sender_idempotency_unique unique (from_user_id, idempotency_key)
);

create index if not exists gift_transfers_sender_created_idx
  on public.gift_transfers (from_user_id, created_at desc);
create index if not exists gift_transfers_receiver_created_idx
  on public.gift_transfers (to_user_id, created_at desc);

alter table public.gift_collections enable row level security;
alter table public.gift_catalog enable row level security;
alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.gift_inventory enable row level security;
alter table public.gift_transfers enable row level security;

revoke all on public.gift_collections, public.gift_catalog,
  public.coin_wallets, public.coin_transactions,
  public.gift_inventory, public.gift_transfers
from public, anon, authenticated;

grant select on public.gift_collections, public.gift_catalog to anon, authenticated;
grant insert, update, delete on public.gift_collections, public.gift_catalog to authenticated;
grant select on public.coin_wallets, public.coin_transactions,
  public.gift_inventory, public.gift_transfers to authenticated;

drop policy if exists gift_collections_read_active_or_manager on public.gift_collections;
drop policy if exists gift_collections_read_active on public.gift_collections;
drop policy if exists gift_collections_staff_read on public.gift_collections;
create policy gift_collections_read_active
  on public.gift_collections for select to anon, authenticated
  using (is_active);

create policy gift_collections_staff_read
  on public.gift_collections for select to authenticated
  using (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_collections_insert_manager on public.gift_collections;
create policy gift_collections_insert_manager
  on public.gift_collections for insert to authenticated
  with check (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_collections_update_manager on public.gift_collections;
create policy gift_collections_update_manager
  on public.gift_collections for update to authenticated
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

drop policy if exists gift_collections_delete_manager on public.gift_collections;
create policy gift_collections_delete_manager
  on public.gift_collections for delete to authenticated
  using (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_catalog_read_published_or_manager on public.gift_catalog;
drop policy if exists gift_catalog_read_published on public.gift_catalog;
drop policy if exists gift_catalog_staff_read on public.gift_catalog;
create policy gift_catalog_read_published
  on public.gift_catalog for select to anon, authenticated
  using (is_published);

create policy gift_catalog_staff_read
  on public.gift_catalog for select to authenticated
  using (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_catalog_insert_manager on public.gift_catalog;
create policy gift_catalog_insert_manager
  on public.gift_catalog for insert to authenticated
  with check (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists gift_catalog_update_manager on public.gift_catalog;
create policy gift_catalog_update_manager
  on public.gift_catalog for update to authenticated
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

drop policy if exists gift_catalog_delete_manager on public.gift_catalog;
create policy gift_catalog_delete_manager
  on public.gift_catalog for delete to authenticated
  using (
    private.has_platform_role('owner')
    or private.has_platform_role('developer')
    or private.has_platform_role('admin')
  );

drop policy if exists coin_wallets_read_own on public.coin_wallets;
create policy coin_wallets_read_own
  on public.coin_wallets for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists coin_transactions_read_own on public.coin_transactions;
create policy coin_transactions_read_own
  on public.coin_transactions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists gift_inventory_read_own on public.gift_inventory;
create policy gift_inventory_read_own
  on public.gift_inventory for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists gift_transfers_read_participant on public.gift_transfers;
create policy gift_transfers_read_participant
  on public.gift_transfers for select to authenticated
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );

-- The public bucket permits direct model downloads. Object listing and all writes
-- stay restricted to Owner, Developer, and Admin accounts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-assets',
  'gift-assets',
  true,
  104857600,
  array['model/gltf-binary', 'model/gltf+json', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists gift_assets_staff_select on storage.objects;
create policy gift_assets_staff_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'gift-assets'
    and (
      private.has_platform_role('owner')
      or private.has_platform_role('developer')
      or private.has_platform_role('admin')
    )
  );

drop policy if exists gift_assets_staff_insert on storage.objects;
create policy gift_assets_staff_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gift-assets'
    and (storage.foldername(name))[1] = 'catalog'
    and (
      private.has_platform_role('owner')
      or private.has_platform_role('developer')
      or private.has_platform_role('admin')
    )
  );

drop policy if exists gift_assets_staff_update on storage.objects;
create policy gift_assets_staff_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'gift-assets'
    and (storage.foldername(name))[1] = 'catalog'
    and (
      private.has_platform_role('owner')
      or private.has_platform_role('developer')
      or private.has_platform_role('admin')
    )
  )
  with check (
    bucket_id = 'gift-assets'
    and (storage.foldername(name))[1] = 'catalog'
    and (
      private.has_platform_role('owner')
      or private.has_platform_role('developer')
      or private.has_platform_role('admin')
    )
  );

drop policy if exists gift_assets_staff_delete on storage.objects;
create policy gift_assets_staff_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'gift-assets'
    and (storage.foldername(name))[1] = 'catalog'
    and (
      private.has_platform_role('owner')
      or private.has_platform_role('developer')
      or private.has_platform_role('admin')
    )
  );

-- Internal write routines are not part of the exposed Data API schema.
create or replace function private.purchase_lumo_gift(
  p_user_id uuid,
  p_gift_id uuid,
  p_idempotency_key text
)
returns table (inventory_id uuid, coin_balance bigint, transaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_price bigint;
  v_balance bigint;
  v_transaction_id uuid;
  v_inventory_id uuid;
  v_existing_reference uuid;
  v_existing_type text;
begin
  if auth.uid() is null or p_user_id is null or auth.uid() <> p_user_id then
    raise exception 'Authentication required for this account';
  end if;

  if p_gift_id is null then
    raise exception 'A gift is required';
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 128 then
    raise exception 'Invalid idempotency key';
  end if;

  select t.id, t.reference_id, t.transaction_type
    into v_transaction_id, v_existing_reference, v_existing_type
  from public.coin_transactions t
  where t.user_id = p_user_id
    and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_type <> 'gift_purchase' or v_existing_reference <> p_gift_id then
      raise exception 'This idempotency key was already used';
    end if;

    select i.id into v_inventory_id
    from public.gift_inventory i
    where i.purchase_transaction_id = v_transaction_id;

    if v_inventory_id is null then
      raise exception 'The previous purchase is incomplete; contact support';
    end if;

    select w.balance into v_balance
    from public.coin_wallets w
    where w.user_id = p_user_id;

    return query select v_inventory_id, coalesce(v_balance, 0), v_transaction_id;
    return;
  end if;

  select g.coin_price into v_price
  from public.gift_catalog g
  where g.id = p_gift_id
    and g.is_published = true;

  if v_price is null then
    raise exception 'This gift is not available';
  end if;

  insert into public.coin_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance into v_balance
  from public.coin_wallets w
  where w.user_id = p_user_id
  for update;

  -- Recheck after taking the wallet lock to make concurrent retries idempotent.
  select t.id, t.reference_id, t.transaction_type
    into v_transaction_id, v_existing_reference, v_existing_type
  from public.coin_transactions t
  where t.user_id = p_user_id
    and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_type <> 'gift_purchase' or v_existing_reference <> p_gift_id then
      raise exception 'This idempotency key was already used';
    end if;

    select i.id into v_inventory_id
    from public.gift_inventory i
    where i.purchase_transaction_id = v_transaction_id;

    if v_inventory_id is null then
      raise exception 'The previous purchase is incomplete; contact support';
    end if;

    return query select v_inventory_id, v_balance, v_transaction_id;
    return;
  end if;

  if v_balance < v_price then
    raise exception 'Not enough LUMO Coins';
  end if;

  update public.coin_wallets
  set balance = balance - v_price,
      lifetime_spent = lifetime_spent + v_price,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.coin_transactions (
    user_id, transaction_type, delta, balance_after,
    reference_id, idempotency_key, metadata
  )
  values (
    p_user_id, 'gift_purchase', -v_price, v_balance,
    p_gift_id, p_idempotency_key, jsonb_build_object('gift_id', p_gift_id)
  )
  returning id into v_transaction_id;

  insert into public.gift_inventory (
    gift_id, owner_id, source, purchase_transaction_id
  )
  values (
    p_gift_id, p_user_id, 'purchase', v_transaction_id
  )
  returning id into v_inventory_id;

  return query select v_inventory_id, v_balance, v_transaction_id;
end;
$function$;

create or replace function private.transfer_lumo_gift(
  p_sender_id uuid,
  p_inventory_id uuid,
  p_receiver_id uuid,
  p_idempotency_key text,
  p_message text default ''
)
returns table (transfer_id uuid, inventory_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_id uuid;
  v_transfer_id uuid;
  v_existing_inventory_id uuid;
  v_existing_receiver_id uuid;
begin
  if auth.uid() is null or p_sender_id is null or auth.uid() <> p_sender_id then
    raise exception 'Authentication required for this account';
  end if;

  if p_receiver_id is null or p_receiver_id = p_sender_id then
    raise exception 'Choose another LUMO member';
  end if;

  if p_inventory_id is null then
    raise exception 'A gift from your inventory is required';
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 8
     or char_length(p_idempotency_key) > 128 then
    raise exception 'Invalid idempotency key';
  end if;

  if p_message is not null and char_length(p_message) > 240 then
    raise exception 'Gift message is too long';
  end if;

  if not exists (select 1 from public.profiles p where p.id = p_receiver_id) then
    raise exception 'Recipient not found';
  end if;

  select i.owner_id into v_owner_id
  from public.gift_inventory i
  where i.id = p_inventory_id
  for update;

  if v_owner_id is null then
    raise exception 'Gift not found';
  end if;

  -- A repeat of the same request returns its original transfer result.
  select t.id, t.inventory_id, t.to_user_id
    into v_transfer_id, v_existing_inventory_id, v_existing_receiver_id
  from public.gift_transfers t
  where t.from_user_id = p_sender_id
    and t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_inventory_id <> p_inventory_id
       or v_existing_receiver_id <> p_receiver_id then
      raise exception 'This idempotency key was already used';
    end if;

    return query select v_transfer_id, v_existing_inventory_id;
    return;
  end if;

  if v_owner_id <> p_sender_id then
    raise exception 'This gift is no longer in your inventory';
  end if;

  update public.gift_inventory
  set owner_id = p_receiver_id,
      source = 'gift_received',
      acquired_from = p_sender_id
  where id = p_inventory_id;

  insert into public.gift_transfers (
    inventory_id, from_user_id, to_user_id, message, idempotency_key
  )
  values (
    p_inventory_id, p_sender_id, p_receiver_id, coalesce(p_message, ''), p_idempotency_key
  )
  returning id into v_transfer_id;

  return query select v_transfer_id, p_inventory_id;
end;
$function$;

revoke all on function private.purchase_lumo_gift(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.transfer_lumo_gift(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.purchase_lumo_gift(uuid, uuid, text) to authenticated;
grant execute on function private.transfer_lumo_gift(uuid, uuid, uuid, text, text) to authenticated;

create or replace function public.purchase_gift(
  p_gift_id uuid,
  p_idempotency_key text
)
returns table (inventory_id uuid, coin_balance bigint, transaction_id uuid)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.purchase_lumo_gift((select auth.uid()), p_gift_id, p_idempotency_key);
$function$;

create or replace function public.transfer_gift(
  p_inventory_id uuid,
  p_receiver_id uuid,
  p_idempotency_key text,
  p_message text default ''
)
returns table (transfer_id uuid, inventory_id uuid)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from private.transfer_lumo_gift(
    (select auth.uid()), p_inventory_id, p_receiver_id, p_idempotency_key, p_message
  );
$function$;

create or replace function public.get_my_coin_balance()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (select w.balance from public.coin_wallets w where w.user_id = (select auth.uid())),
    0
  )::bigint;
$function$;

revoke all on function public.purchase_gift(uuid, text) from public, anon;
revoke all on function public.transfer_gift(uuid, uuid, text, text) from public, anon;
revoke all on function public.get_my_coin_balance() from public, anon;
grant execute on function public.purchase_gift(uuid, text) to authenticated;
grant execute on function public.transfer_gift(uuid, uuid, text, text) to authenticated;
grant execute on function public.get_my_coin_balance() to authenticated;

notify pgrst, 'reload schema';

commit;
