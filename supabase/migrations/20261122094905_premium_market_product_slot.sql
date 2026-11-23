begin;

-- LUMO Plus includes one concurrent Community Market product listing.
-- Keep this rule in Postgres so it cannot be bypassed by a modified client.

create or replace function public.enforce_lumo_plus_market_product_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_is_premium boolean;
  v_existing_products integer;
begin
  if new.kind <> 'product' or new.status not in ('draft', 'active') then
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> new.seller_id then
    raise exception using
      errcode = '42501',
      message = 'You can only publish a product for your own account.';
  end if;

  -- Serialize concurrent product creates/activations by the same seller.
  perform pg_advisory_xact_lock(hashtextextended(new.seller_id::text, 0));

  select exists (
    select 1
    from public.user_memberships m
    where m.user_id = new.seller_id
      and m.membership_type = 'member_premium'
      and m.starts_at <= now()
      and (m.expires_at is null or m.expires_at > now())
  )
  into v_is_premium;

  if not coalesce(v_is_premium, false) then
    raise exception using
      errcode = '42501',
      message = 'Publishing a Community Market product requires active LUMO Plus membership.';
  end if;

  select count(*)::integer
    into v_existing_products
  from public.market_listings l
  where l.seller_id = new.seller_id
    and l.kind = 'product'
    and l.status in ('draft', 'active')
    and l.id is distinct from new.id;

  if v_existing_products >= 1 then
    raise exception using
      errcode = '23514',
      message = 'LUMO Plus includes one active Community Market product at a time. Archive or mark the current product as sold before adding another.';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_lumo_plus_market_product_slot() from public, anon, authenticated;

drop trigger if exists lumo_plus_market_product_slot_insert on public.market_listings;
create trigger lumo_plus_market_product_slot_insert
before insert on public.market_listings
for each row
execute function public.enforce_lumo_plus_market_product_slot();

drop trigger if exists lumo_plus_market_product_slot_update on public.market_listings;
create trigger lumo_plus_market_product_slot_update
before update of seller_id, kind, status on public.market_listings
for each row
execute function public.enforce_lumo_plus_market_product_slot();

notify pgrst, 'reload schema';

commit;
