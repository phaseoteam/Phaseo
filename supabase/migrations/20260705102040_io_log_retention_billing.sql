alter table public.workspace_settings
  add column if not exists io_logging_billing_status text not null default 'active',
  add column if not exists io_logging_grace_until timestamptz,
  add column if not exists io_logging_last_billed_at timestamptz,
  add column if not exists io_logging_last_billing_warning_at timestamptz,
  add column if not exists io_logging_last_billing_warning_kind text,
  add column if not exists io_logging_price_per_million_units_nanos bigint not null default 0;

alter table public.workspace_settings
  alter column io_logging_retention_days set default 90;

alter table public.workspace_settings
  drop constraint if exists workspace_settings_io_logging_retention_days_check;

alter table public.workspace_settings
  add constraint workspace_settings_io_logging_retention_days_check
  check (io_logging_retention_days between 90 and 365);

update public.workspace_settings
set io_logging_retention_days = 90
where io_logging_enabled = true
  and io_logging_retention_days = 30;

alter table public.gateway_request_details
  drop constraint if exists gateway_request_details_io_log_status_check;

alter table public.gateway_request_details
  add constraint gateway_request_details_io_log_status_check
  check (io_log_status in ('not_enabled', 'stored', 'missing_bucket', 'too_large', 'error', 'deleted'));

alter table public.workspace_settings
  drop constraint if exists workspace_settings_io_logging_billing_status_check;

alter table public.workspace_settings
  add constraint workspace_settings_io_logging_billing_status_check
  check (io_logging_billing_status in ('active', 'grace', 'suspended'));

alter table public.workspace_settings
  drop constraint if exists workspace_settings_io_logging_price_per_million_units_check;

alter table public.workspace_settings
  add constraint workspace_settings_io_logging_price_per_million_units_check
  check (io_logging_price_per_million_units_nanos >= 0);

comment on column public.workspace_settings.io_logging_billing_status is
  'Credit-metered extended retention state for I/O logs. Suspended workspaces receive only included retention.';

comment on column public.workspace_settings.io_logging_price_per_million_units_nanos is
  'Monthly credit price override in nanos per million retained I/O log units. Zero uses the default 25% target-margin schedule. One unit is currently 64KB.';

create table if not exists public.gateway_io_retention_billing_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  billing_date date not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'pending',
  event_units bigint not null default 0,
  billable_bytes bigint not null default 0,
  object_count bigint not null default 0,
  amount_nanos bigint not null default 0,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  grace_until timestamptz,
  error text,
  constraint gateway_io_retention_billing_runs_status_check
    check (status in ('pending', 'charged', 'already_charged', 'grace', 'suspended', 'skipped', 'error')),
  constraint gateway_io_retention_billing_runs_workspace_date_key
    unique (workspace_id, billing_date)
);

create index if not exists gateway_io_retention_billing_runs_workspace_created_idx
  on public.gateway_io_retention_billing_runs (workspace_id, created_at desc);

alter table public.gateway_io_retention_billing_runs enable row level security;

revoke all on public.gateway_io_retention_billing_runs from anon, authenticated;

drop policy if exists gateway_io_retention_billing_runs_select_service on public.gateway_io_retention_billing_runs;
create policy gateway_io_retention_billing_runs_select_service
  on public.gateway_io_retention_billing_runs
  for select
  to service_role
  using (true);

drop policy if exists gateway_io_retention_billing_runs_insert_service on public.gateway_io_retention_billing_runs;
create policy gateway_io_retention_billing_runs_insert_service
  on public.gateway_io_retention_billing_runs
  for insert
  to service_role
  with check (true);

drop policy if exists gateway_io_retention_billing_runs_update_service on public.gateway_io_retention_billing_runs;
create policy gateway_io_retention_billing_runs_update_service
  on public.gateway_io_retention_billing_runs
  for update
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.gateway_io_retention_billing_runs to service_role;

create or replace function public.gateway_io_retention_usage_snapshot(
  p_workspace_id uuid,
  p_as_of timestamptz default now(),
  p_included_days integer default 90,
  p_event_unit_bytes integer default 65536
)
returns table(
  event_units bigint,
  billable_bytes bigint,
  object_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(ceil(greatest(coalesce(d.io_log_bytes, 0), 0)::numeric / greatest(p_event_unit_bytes, 1))::bigint), 0)::bigint as event_units,
    coalesce(sum(greatest(coalesce(d.io_log_bytes, 0), 0)), 0)::bigint as billable_bytes,
    count(*)::bigint as object_count
  from public.gateway_request_details d
  where d.workspace_id = p_workspace_id
    and d.io_log_status = 'stored'
    and d.io_log_object_key is not null
    and d.io_log_retention_until > p_as_of
    and d.created_at < p_as_of - make_interval(days => greatest(p_included_days, 0));
$$;

revoke all on function public.gateway_io_retention_usage_snapshot(uuid, timestamptz, integer, integer) from public;
grant execute on function public.gateway_io_retention_usage_snapshot(uuid, timestamptz, integer, integer) to service_role;

create or replace function public.gateway_io_retention_charge_once(
  p_workspace_id uuid,
  p_billing_date date,
  p_amount_nanos bigint,
  p_event_units bigint,
  p_billable_bytes bigint,
  p_object_count bigint,
  p_grace_days integer default 14
)
returns table(
  status text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  grace_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_ref_id text;
  v_existing_ledger public.credit_ledger%rowtype;
  v_before bigint;
  v_after bigint;
  v_grace_until timestamptz;
  v_status text;
  v_wallet_found boolean := false;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;

  if p_billing_date is null then
    raise exception 'missing_billing_date';
  end if;

  v_ref_id := 'io_retention:' || p_workspace_id::text || ':' || p_billing_date::text;

  select *
  into v_existing_ledger
  from public.credit_ledger
  where ref_type = 'gateway_io_retention'
    and ref_id = v_ref_id;

  if found then
    insert into public.gateway_io_retention_billing_runs (
      workspace_id,
      billing_date,
      processed_at,
      status,
      event_units,
      billable_bytes,
      object_count,
      amount_nanos,
      before_balance_nanos,
      after_balance_nanos
    ) values (
      p_workspace_id,
      p_billing_date,
      now(),
      'already_charged',
      greatest(coalesce(p_event_units, 0), 0),
      greatest(coalesce(p_billable_bytes, 0), 0),
      greatest(coalesce(p_object_count, 0), 0),
      greatest(coalesce(p_amount_nanos, 0), 0),
      v_existing_ledger.before_balance_nanos,
      v_existing_ledger.after_balance_nanos
    )
    on conflict (workspace_id, billing_date) do update
    set processed_at = excluded.processed_at,
        status = excluded.status,
        event_units = excluded.event_units,
        billable_bytes = excluded.billable_bytes,
        object_count = excluded.object_count,
        amount_nanos = excluded.amount_nanos,
        before_balance_nanos = excluded.before_balance_nanos,
        after_balance_nanos = excluded.after_balance_nanos,
        error = null;

    return query
    select
      'already_charged'::text,
      coalesce(v_existing_ledger.amount_nanos, 0),
      v_existing_ledger.before_balance_nanos,
      v_existing_ledger.after_balance_nanos,
      null::timestamptz;
    return;
  end if;

  select *
  into v_settings
  from public.workspace_settings
  where workspace_id = p_workspace_id
  for update;

  if not found then
    insert into public.workspace_settings (workspace_id)
    values (p_workspace_id)
    on conflict (workspace_id) do nothing;

    select *
    into v_settings
    from public.workspace_settings
    where workspace_id = p_workspace_id
    for update;
  end if;

  if greatest(coalesce(p_amount_nanos, 0), 0) = 0 then
    update public.workspace_settings
    set io_logging_billing_status = case
          when io_logging_enabled then 'active'
          else io_logging_billing_status
        end,
        io_logging_grace_until = null,
        io_logging_last_billed_at = now(),
        updated_at = now()
    where workspace_id = p_workspace_id;

    insert into public.gateway_io_retention_billing_runs (
      workspace_id,
      billing_date,
      processed_at,
      status,
      event_units,
      billable_bytes,
      object_count,
      amount_nanos
    ) values (
      p_workspace_id,
      p_billing_date,
      now(),
      'skipped',
      greatest(coalesce(p_event_units, 0), 0),
      greatest(coalesce(p_billable_bytes, 0), 0),
      greatest(coalesce(p_object_count, 0), 0),
      0
    )
    on conflict (workspace_id, billing_date) do update
    set processed_at = excluded.processed_at,
        status = excluded.status,
        event_units = excluded.event_units,
        billable_bytes = excluded.billable_bytes,
        object_count = excluded.object_count,
        amount_nanos = excluded.amount_nanos,
        error = null;

    return query select 'skipped'::text, 0::bigint, null::bigint, null::bigint, null::timestamptz;
    return;
  end if;

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;
  v_wallet_found := found;

  if not v_wallet_found or coalesce(v_wallet.balance_nanos, 0) < p_amount_nanos then
    if coalesce(v_settings.io_logging_billing_status, 'active') = 'grace'
       and v_settings.io_logging_grace_until is not null
       and v_settings.io_logging_grace_until <= now() then
      v_status := 'suspended';
      v_grace_until := v_settings.io_logging_grace_until;

      update public.workspace_settings
      set io_logging_billing_status = 'suspended',
          io_logging_grace_until = null,
          updated_at = now()
      where workspace_id = p_workspace_id;
    else
      v_status := 'grace';
      v_grace_until := coalesce(
        v_settings.io_logging_grace_until,
        now() + make_interval(days => greatest(coalesce(p_grace_days, 14), 1))
      );

      update public.workspace_settings
      set io_logging_billing_status = 'grace',
          io_logging_grace_until = v_grace_until,
          updated_at = now()
      where workspace_id = p_workspace_id;
    end if;

    insert into public.gateway_io_retention_billing_runs (
      workspace_id,
      billing_date,
      processed_at,
      status,
      event_units,
      billable_bytes,
      object_count,
      amount_nanos,
      before_balance_nanos,
      after_balance_nanos,
      grace_until,
      error
    ) values (
      p_workspace_id,
      p_billing_date,
      now(),
      v_status,
      greatest(coalesce(p_event_units, 0), 0),
      greatest(coalesce(p_billable_bytes, 0), 0),
      greatest(coalesce(p_object_count, 0), 0),
      greatest(coalesce(p_amount_nanos, 0), 0),
      case when v_wallet_found then v_wallet.balance_nanos else null end,
      case when v_wallet_found then v_wallet.balance_nanos else null end,
      v_grace_until,
      case when v_wallet_found then 'insufficient_credits' else 'wallet_not_found' end
    )
    on conflict (workspace_id, billing_date) do update
    set processed_at = excluded.processed_at,
        status = excluded.status,
        event_units = excluded.event_units,
        billable_bytes = excluded.billable_bytes,
        object_count = excluded.object_count,
        amount_nanos = excluded.amount_nanos,
        before_balance_nanos = excluded.before_balance_nanos,
        after_balance_nanos = excluded.after_balance_nanos,
        grace_until = excluded.grace_until,
        error = excluded.error;

    return query
    select
      v_status,
      greatest(coalesce(p_amount_nanos, 0), 0),
      case when v_wallet_found then v_wallet.balance_nanos else null end,
      case when v_wallet_found then v_wallet.balance_nanos else null end,
      v_grace_until;
    return;
  end if;

  v_before := v_wallet.balance_nanos;
  v_after := v_wallet.balance_nanos - p_amount_nanos;

  update public.wallets
  set balance_nanos = v_after,
      updated_at = now()
  where workspace_id = p_workspace_id;

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
    'io_retention',
    -p_amount_nanos,
    v_before,
    v_after,
    'gateway_io_retention',
    v_ref_id,
    now(),
    'charged'
  ) on conflict (ref_type, ref_id) do nothing;

  update public.workspace_settings
  set io_logging_billing_status = 'active',
      io_logging_grace_until = null,
      io_logging_last_billed_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id;

  insert into public.gateway_io_retention_billing_runs (
    workspace_id,
    billing_date,
    processed_at,
    status,
    event_units,
    billable_bytes,
    object_count,
    amount_nanos,
    before_balance_nanos,
    after_balance_nanos
  ) values (
    p_workspace_id,
    p_billing_date,
    now(),
    'charged',
    greatest(coalesce(p_event_units, 0), 0),
    greatest(coalesce(p_billable_bytes, 0), 0),
    greatest(coalesce(p_object_count, 0), 0),
    p_amount_nanos,
    v_before,
    v_after
  )
  on conflict (workspace_id, billing_date) do update
  set processed_at = excluded.processed_at,
      status = excluded.status,
      event_units = excluded.event_units,
      billable_bytes = excluded.billable_bytes,
      object_count = excluded.object_count,
      amount_nanos = excluded.amount_nanos,
      before_balance_nanos = excluded.before_balance_nanos,
      after_balance_nanos = excluded.after_balance_nanos,
      grace_until = null,
      error = null;

  return query select 'charged'::text, p_amount_nanos, v_before, v_after, null::timestamptz;
end;
$$;

revoke all on function public.gateway_io_retention_charge_once(uuid, date, bigint, bigint, bigint, bigint, integer) from public;
grant execute on function public.gateway_io_retention_charge_once(uuid, date, bigint, bigint, bigint, bigint, integer) to service_role;
