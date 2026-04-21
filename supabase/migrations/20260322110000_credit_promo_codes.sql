-- Promo credit code system:
-- - Admin-managed credit grants
-- - Atomic user redemption into wallet + ledger
-- - Global one-time redemption per user per grant

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()
      and lower(coalesce(u.role::text, '')) = 'admin'
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.is_admin_user() to service_role;

create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text not null,
  amount_nanos bigint not null check (amount_nanos > 0),
  max_redemptions integer not null check (max_redemptions > 0),
  redemptions_count integer not null default 0 check (redemptions_count >= 0),
  expires_at timestamptz null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz null,
  note text null,
  constraint credit_grants_redemption_bounds check (redemptions_count <= max_redemptions)
);

create unique index if not exists credit_grants_code_normalized_key
  on public.credit_grants (code_normalized);

create index if not exists credit_grants_active_expiry_idx
  on public.credit_grants (is_active, expires_at, code_normalized);

create table if not exists public.credit_grant_redemptions (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.credit_grants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  amount_nanos bigint not null check (amount_nanos > 0),
  created_at timestamptz not null default now(),
  constraint credit_grant_redemptions_grant_user_unique unique (grant_id, user_id)
);

create index if not exists credit_grant_redemptions_user_created_idx
  on public.credit_grant_redemptions (user_id, created_at desc);

create index if not exists credit_grant_redemptions_team_created_idx
  on public.credit_grant_redemptions (workspace_id, created_at desc);

alter table public.credit_grants enable row level security;
alter table public.credit_grant_redemptions enable row level security;

drop policy if exists credit_grants_admin_all on public.credit_grants;
create policy credit_grants_admin_all
  on public.credit_grants
  for all
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

drop policy if exists credit_grant_redemptions_admin_all on public.credit_grant_redemptions;
create policy credit_grant_redemptions_admin_all
  on public.credit_grant_redemptions
  for all
  to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

drop policy if exists credit_grants_service_all on public.credit_grants;
create policy credit_grants_service_all
  on public.credit_grants
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists credit_grant_redemptions_service_all on public.credit_grant_redemptions;
create policy credit_grant_redemptions_service_all
  on public.credit_grant_redemptions
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.credit_grants to authenticated;
grant select, insert, update on public.credit_grant_redemptions to authenticated;
grant select, insert, update, delete on public.credit_grants to service_role;
grant select, insert, update, delete on public.credit_grant_redemptions to service_role;

create or replace function public.redeem_credit_code(
  p_code text,
  p_workspace_id uuid
)
returns table(
  status text,
  message text,
  grant_id uuid,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code_normalized text;
  v_grant public.credit_grants%rowtype;
  v_wallet public.wallets%rowtype;
  v_team_billing_mode text;
  v_redemption_id uuid;
begin
  if v_user_id is null then
    return query
    select
      'unauthorized'::text,
      'You must be signed in to redeem a credit code.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select lower(coalesce(t.billing_mode::text, 'wallet'))
  into v_team_billing_mode
  from public.workspaces t
  where t.id = p_workspace_id;

  if not found then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_team_billing_mode = 'invoice' then
    return query
    select
      'invoice_mode'::text,
      'Credit codes are not available for invoice billing teams.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  v_code_normalized := upper(trim(coalesce(p_code, '')));

  if v_code_normalized = ''
    or length(v_code_normalized) > 64
    or v_code_normalized !~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'
  then
    return query
    select
      'invalid_code_format'::text,
      'Credit code format is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_grant
  from public.credit_grants cg
  where cg.code_normalized = v_code_normalized
  for update;

  if not found then
    return query
    select
      'not_found'::text,
      'This credit code is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if not coalesce(v_grant.is_active, false) then
    return query
    select
      'inactive'::text,
      'This credit code is inactive.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_grant.expires_at is not null and v_grant.expires_at <= now() then
    return query
    select
      'expired'::text,
      'This credit code has expired.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if coalesce(v_grant.redemptions_count, 0) >= v_grant.max_redemptions then
    return query
    select
      'maxed_out'::text,
      'This credit code has reached its redemption limit.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_wallet
  from public.wallets w
  where w.workspace_id = p_workspace_id
  for update;

  if not found then
    return query
    select
      'wallet_not_found'::text,
      'Wallet not found for this team.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  insert into public.credit_grant_redemptions (
    grant_id,
    user_id,
    workspace_id,
    amount_nanos
  ) values (
    v_grant.id,
    v_user_id,
    p_workspace_id,
    v_grant.amount_nanos
  )
  on conflict on constraint credit_grant_redemptions_grant_user_unique
  do nothing
  returning id
  into v_redemption_id;

  if v_redemption_id is null then
    return query
    select
      'already_redeemed'::text,
      'You have already redeemed this credit code.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  update public.wallets
  set balance_nanos = balance_nanos + v_grant.amount_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  insert into public.credit_ledger (
    workspace_id,
    event_time,
    kind,
    amount_nanos,
    before_balance_nanos,
    after_balance_nanos,
    ref_type,
    ref_id,
    created_at,
    status
  ) values (
    p_workspace_id,
    now(),
    'promo_code',
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    'promo_code_redeem',
    v_redemption_id::text,
    now(),
    'paid'
  ) on conflict (ref_type, ref_id) do nothing;

  update public.credit_grants
  set redemptions_count = redemptions_count + 1
  where id = v_grant.id;

  return query
  select
    'succeeded'::text,
    'Promo credit applied successfully.'::text,
    v_grant.id,
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    p_workspace_id;
end;
$$;

revoke all on function public.redeem_credit_code(text, uuid) from public;
grant execute on function public.redeem_credit_code(text, uuid) to authenticated;
grant execute on function public.redeem_credit_code(text, uuid) to service_role;
