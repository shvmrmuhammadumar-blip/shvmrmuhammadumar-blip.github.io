begin;

create table if not exists public.developer_test_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_code text not null default 'lumo_plus_30d'
    check (product_code = 'lumo_plus_30d'),
  provider text not null default 'developer_simulator'
    check (provider = 'developer_simulator'),
  environment text not null default 'test'
    check (environment = 'test'),
  status text not null
    check (status in ('paid', 'declined', 'cancelled')),
  amount_uzs integer not null default 1000
    check (amount_uzs = 1000),
  currency text not null default 'UZS'
    check (currency = 'UZS'),
  duration_days integer not null default 30
    check (duration_days = 30),
  idempotency_key text not null
    check (char_length(idempotency_key) between 12 and 120),
  membership_expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint developer_test_payments_idempotency_unique unique (user_id, idempotency_key),
  constraint developer_test_payments_completed_check
    check ((status = 'paid') = (completed_at is not null)),
  constraint developer_test_payments_paid_expiry_check
    check (status <> 'paid' or membership_expires_at is not null)
);

create index if not exists developer_test_payments_user_created_idx
  on public.developer_test_payments (user_id, created_at desc);

alter table public.developer_test_payments enable row level security;

revoke all on public.developer_test_payments from public, anon, authenticated;
grant select on public.developer_test_payments to authenticated;

drop policy if exists developer_test_payments_read_own on public.developer_test_payments;
create policy developer_test_payments_read_own
  on public.developer_test_payments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_platform_role('developer')
  );

create or replace function public.is_lumo_plus_developer_test_allowed()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select auth.uid() is not null
    and private.has_platform_role('developer');
$function$;

revoke all on function public.is_lumo_plus_developer_test_allowed() from public, anon;
grant execute on function public.is_lumo_plus_developer_test_allowed() to authenticated;

create or replace function private.create_lumo_plus_developer_test_payment(
  p_idempotency_key text,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.developer_test_payments%rowtype;
  v_payment public.developer_test_payments%rowtype;
  v_previous_type text;
  v_previous_starts_at timestamptz;
  v_previous_expires_at timestamptz;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
  v_action text;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if not private.has_platform_role('developer') then
    raise exception using errcode = '42501', message = 'Developer access is required for payment testing.';
  end if;

  if p_idempotency_key is null
     or char_length(p_idempotency_key) < 12
     or char_length(p_idempotency_key) > 120 then
    raise exception using errcode = '22023', message = 'Invalid test payment request key.';
  end if;

  if p_outcome is null or p_outcome not in ('paid', 'declined', 'cancelled') then
    raise exception using errcode = '22023', message = 'Unsupported test payment outcome.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor::text || ':' || p_idempotency_key, 0)
  );

  select *
    into v_existing
  from public.developer_test_payments p
  where p.user_id = v_actor
    and p.idempotency_key = p_idempotency_key;

  if found then
    return pg_catalog.jsonb_build_object(
      'success', true,
      'test_mode', true,
      'already_processed', true,
      'payment_id', v_existing.id,
      'status', v_existing.status,
      'amount_uzs', v_existing.amount_uzs,
      'currency', v_existing.currency,
      'duration_days', v_existing.duration_days,
      'membership_expires_at', v_existing.membership_expires_at
    );
  end if;

  if p_outcome = 'paid' then
    select m.membership_type, m.starts_at, m.expires_at
      into v_previous_type, v_previous_starts_at, v_previous_expires_at
    from public.user_memberships m
    where m.user_id = v_actor
    for update;

    if v_previous_type = 'member_premium'
       and v_previous_starts_at <= now()
       and (v_previous_expires_at is null or v_previous_expires_at > now()) then
      if v_previous_expires_at is null then
        raise exception using errcode = '22023',
          message = 'This account already has lifetime Premium; a test renewal is not needed.';
      end if;
      v_starts_at := v_previous_starts_at;
      v_expires_at := v_previous_expires_at + interval '30 days';
      v_action := 'renewed';
    else
      v_starts_at := now();
      v_expires_at := v_starts_at + interval '30 days';
      v_action := 'activated';
    end if;
  end if;

  insert into public.developer_test_payments (
    user_id,
    product_code,
    provider,
    environment,
    status,
    amount_uzs,
    currency,
    duration_days,
    idempotency_key,
    membership_expires_at,
    completed_at
  )
  values (
    v_actor,
    'lumo_plus_30d',
    'developer_simulator',
    'test',
    p_outcome,
    1000,
    'UZS',
    30,
    p_idempotency_key,
    case when p_outcome = 'paid' then v_expires_at else null end,
    case when p_outcome = 'paid' then now() else null end
  )
  returning * into v_payment;

  if p_outcome = 'paid' then
    insert into public.user_memberships (
      user_id,
      membership_type,
      starts_at,
      expires_at,
      source,
      updated_by,
      created_at,
      updated_at
    )
    values (
      v_actor,
      'member_premium',
      v_starts_at,
      v_expires_at,
      'promotion',
      v_actor,
      now(),
      now()
    )
    on conflict (user_id) do update
      set membership_type = excluded.membership_type,
          starts_at = excluded.starts_at,
          expires_at = excluded.expires_at,
          source = excluded.source,
          updated_by = excluded.updated_by,
          updated_at = now();

    insert into public.user_membership_events (
      user_id,
      previous_membership_type,
      membership_type,
      action,
      starts_at,
      expires_at,
      source,
      actor_id,
      reason
    )
    values (
      v_actor,
      v_previous_type,
      'member_premium',
      v_action,
      v_starts_at,
      v_expires_at,
      'promotion',
      v_actor,
      'Developer-only simulated payment. No real money was charged.'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'success', true,
    'test_mode', true,
    'already_processed', false,
    'payment_id', v_payment.id,
    'status', v_payment.status,
    'amount_uzs', v_payment.amount_uzs,
    'currency', v_payment.currency,
    'duration_days', v_payment.duration_days,
    'membership_expires_at', v_payment.membership_expires_at
  );
end;
$function$;

revoke all on function private.create_lumo_plus_developer_test_payment(text, text)
  from public, anon, authenticated;
grant execute on function private.create_lumo_plus_developer_test_payment(text, text)
  to authenticated;

create or replace function public.create_lumo_plus_developer_test_payment(
  p_idempotency_key text,
  p_outcome text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.create_lumo_plus_developer_test_payment(
    p_idempotency_key,
    p_outcome
  );
$function$;

revoke all on function public.create_lumo_plus_developer_test_payment(text, text)
  from public, anon;
grant execute on function public.create_lumo_plus_developer_test_payment(text, text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
