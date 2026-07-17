-- Enforce batch wallet/key holds and make settled batch usage visible to key limits.

grant insert, update on public.gateway_webhook_endpoints to authenticated;
revoke select on public.gateway_webhook_endpoints from authenticated;
grant select (
  id, workspace_id, name, url, status, events, created_by,
  created_at, updated_at, deleted_at
) on public.gateway_webhook_endpoints to authenticated;

alter table public.gateway_provider_events
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz null,
  add column if not exists last_error text null,
  add column if not exists dead_lettered_at timestamptz null;

create index if not exists gateway_provider_events_replay_due_idx
  on public.gateway_provider_events (next_attempt_at, created_at)
  where processed_at is null;

create or replace function public.gateway_defer_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_attempt integer;
begin
  select attempt_count + 1 into v_next_attempt
  from public.gateway_provider_events
  where provider = p_provider and provider_event_id = p_provider_event_id
  for update;
  if not found then return; end if;

  update public.gateway_provider_events
  set attempt_count = v_next_attempt,
      last_error = left(coalesce(p_reason, 'provider_event_deferred'), 500),
      next_attempt_at = case
        when v_next_attempt >= 20 then null
        else now() + make_interval(secs => least(1800, 5 * (2 ^ least(v_next_attempt, 8))::integer))
      end,
      dead_lettered_at = case when v_next_attempt >= 20 then now() else dead_lettered_at end,
      processed_at = case when v_next_attempt >= 20 then now() else processed_at end,
      updated_at = now()
  where provider = p_provider and provider_event_id = p_provider_event_id;
end;
$$;

revoke all on function public.gateway_defer_provider_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.gateway_defer_provider_event(text, text, text)
  to service_role;

create table if not exists public.gateway_batch_file_uploads (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  upload_id text not null,
  bytes bigint not null check (bytes > 0),
  status text not null check (status in ('claimed', 'completed', 'failed')),
  provider_file_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, upload_id)
);

alter table public.gateway_batch_file_uploads enable row level security;
grant select, insert, update on public.gateway_batch_file_uploads to service_role;

create or replace function public.gateway_claim_batch_file_upload(
  p_workspace_id uuid,
  p_upload_id text,
  p_bytes bigint
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour_count bigint;
  v_day_bytes bigint;
begin
  if p_workspace_id is null or coalesce(trim(p_upload_id), '') = '' or p_bytes is null or p_bytes <= 0 then
    raise exception 'invalid_batch_file_upload_claim';
  end if;
  if p_bytes > 20971520 then
    return query select false, 'batch_file_too_large'::text;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('batch-file:' || p_workspace_id::text, 0));
  if not exists (
    select 1 from public.wallets
    where workspace_id = p_workspace_id
      and coalesce(balance_nanos, 0) - coalesce(reserved_nanos, 0) > 0
  ) then
    return query select false, 'insufficient_funds'::text;
    return;
  end if;
  select count(*) into v_hour_count
  from public.gateway_batch_file_uploads
  where workspace_id = p_workspace_id and created_at >= now() - interval '1 hour';
  if v_hour_count >= 20 then
    return query select false, 'batch_file_hourly_quota_exceeded'::text;
    return;
  end if;
  select coalesce(sum(bytes), 0) into v_day_bytes
  from public.gateway_batch_file_uploads
  where workspace_id = p_workspace_id and created_at >= now() - interval '24 hours';
  if v_day_bytes + p_bytes > 104857600 then
    return query select false, 'batch_file_daily_bytes_exceeded'::text;
    return;
  end if;
  insert into public.gateway_batch_file_uploads (workspace_id, upload_id, bytes, status)
  values (p_workspace_id, p_upload_id, p_bytes, 'claimed')
  on conflict (workspace_id, upload_id) do nothing;
  return query select true, null::text;
end;
$$;

create or replace function public.gateway_finish_batch_file_upload(
  p_workspace_id uuid,
  p_upload_id text,
  p_status text,
  p_provider_file_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status is null or p_status not in ('completed', 'failed') then
    raise exception 'invalid_batch_file_upload_status';
  end if;
  update public.gateway_batch_file_uploads
  set status = p_status,
      provider_file_id = nullif(trim(coalesce(p_provider_file_id, '')), ''),
      updated_at = now()
  where workspace_id = p_workspace_id and upload_id = p_upload_id;
end;
$$;

revoke all on function public.gateway_claim_batch_file_upload(uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.gateway_finish_batch_file_upload(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.gateway_claim_batch_file_upload(uuid, text, bigint) to service_role;
grant execute on function public.gateway_finish_batch_file_upload(uuid, text, text, text) to service_role;

alter table public.gateway_wallet_reservations
  add column if not exists key_id uuid null references public.keys(id) on delete set null,
  add column if not exists request_count integer null check (request_count is null or request_count > 0),
  add column if not exists key_usage_recorded_at timestamptz null;

create index if not exists gateway_wallet_reservations_key_pending_idx
  on public.gateway_wallet_reservations (key_id, status, created_at)
  where key_id is not null;

create or replace function public.gateway_cleanup_batch_hold_key_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'released' and old.status is distinct from new.status and new.key_id is not null then
    delete from public.gateway_requests
    where workspace_id = new.workspace_id
      and key_id = new.key_id
      and request_id like 'batch_hold_usage:' || new.reservation_id || ':%';
  end if;
  return new;
end;
$$;

revoke all on function public.gateway_cleanup_batch_hold_key_usage()
  from public, anon, authenticated;

drop trigger if exists gateway_cleanup_batch_hold_key_usage_trigger
  on public.gateway_wallet_reservations;
create trigger gateway_cleanup_batch_hold_key_usage_trigger
after update of status on public.gateway_wallet_reservations
for each row execute function public.gateway_cleanup_batch_hold_key_usage();

drop function if exists public.gateway_wallet_reserve_once(uuid, text, bigint, text);
drop function if exists public.gateway_wallet_reserve_once(uuid, text, bigint, text, uuid, integer);

create or replace function public.gateway_wallet_reserve_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_amount_nanos bigint,
  p_hold_ref_id text default null,
  p_key_id uuid default null,
  p_request_count integer default null
)
returns table (
  ok boolean,
  applied boolean,
  reason text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.gateway_wallet_reservations%rowtype;
  v_key public.keys%rowtype;
  v_available bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  v_week_start timestamptz := (date_trunc('week', now() at time zone 'utc') at time zone 'utc');
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'utc') at time zone 'utc');
  v_day_requests bigint := 0;
  v_week_requests bigint := 0;
  v_month_requests bigint := 0;
  v_day_cost bigint := 0;
  v_week_cost bigint := 0;
  v_month_cost bigint := 0;
  v_requested_count integer := greatest(0, coalesce(p_request_count, 0));
begin
  if p_workspace_id is null or coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'invalid_reservation_identity';
  end if;
  if p_amount_nanos is null or p_amount_nanos <= 0 then
    raise exception 'invalid_reservation_amount';
  end if;
  if p_key_id is not null and v_requested_count <= 0 then
    raise exception 'batch_request_count_required';
  end if;
  if v_requested_count > 10000 then
    raise exception 'batch_request_limit_exceeded';
  end if;

  select * into v_existing
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  for update;
  if found then
    select * into v_wallet from public.wallets
    where workspace_id = p_workspace_id for update;
    if not found then
      return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_existing.amount_nanos <> p_amount_nanos
      or v_existing.key_id is distinct from p_key_id
      or coalesce(v_existing.request_count, 0) <> v_requested_count then
      raise exception 'reservation_identity_mismatch';
    end if;
    if v_existing.status in ('held', 'reserved') then
      return query select true, false, 'already_reserved'::text, v_existing.amount_nanos,
        coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
        coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
      return;
    end if;
    return query select false, false, 'reservation_not_active'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  if p_key_id is not null then
    select * into v_key from public.keys where id = p_key_id for update;
    if not found then
      return query select false, false, 'key_not_found'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_key.workspace_id <> p_workspace_id then
      return query select false, false, 'key_wrong_workspace'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if v_key.status <> 'active' or (v_key.expires_at is not null and v_key.expires_at <= now()) then
      return query select false, false, 'key_not_active'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.soft_blocked, false) then
      return query select false, false, 'key_limit_soft_blocked'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    select
      count(*) filter (where created_at >= v_day_start),
      count(*) filter (where created_at >= v_week_start),
      count(*) filter (where created_at >= v_month_start),
      coalesce(sum(cost_nanos) filter (where created_at >= v_day_start), 0),
      coalesce(sum(cost_nanos) filter (where created_at >= v_week_start), 0),
      coalesce(sum(cost_nanos) filter (where created_at >= v_month_start), 0)
    into v_day_requests, v_week_requests, v_month_requests,
      v_day_cost, v_week_cost, v_month_cost
    from public.gateway_requests
    where workspace_id = p_workspace_id and key_id = p_key_id and success is true;

    if coalesce(v_key.daily_limit_requests, 0) > 0
      and v_day_requests + v_requested_count > v_key.daily_limit_requests then
      return query select false, false, 'daily_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.weekly_limit_requests, 0) > 0
      and v_week_requests + v_requested_count > v_key.weekly_limit_requests then
      return query select false, false, 'weekly_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.monthly_limit_requests, 0) > 0
      and v_month_requests + v_requested_count > v_key.monthly_limit_requests then
      return query select false, false, 'monthly_request_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.daily_limit_cost_nanos, 0) > 0
      and v_day_cost + p_amount_nanos > v_key.daily_limit_cost_nanos then
      return query select false, false, 'daily_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.weekly_limit_cost_nanos, 0) > 0
      and v_week_cost + p_amount_nanos > v_key.weekly_limit_cost_nanos then
      return query select false, false, 'weekly_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
    if coalesce(v_key.monthly_limit_cost_nanos, 0) > 0
      and v_month_cost + p_amount_nanos > v_key.monthly_limit_cost_nanos then
      return query select false, false, 'monthly_cost_limit_reached'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;
  end if;

  select * into v_wallet from public.wallets
  where workspace_id = p_workspace_id for update;
  if not found then
    return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  v_available := coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0);
  if v_available < p_amount_nanos then
    return query select false, false, 'insufficient_balance'::text, p_amount_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  insert into public.gateway_wallet_reservations (
    reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
    key_id, request_count, created_at, updated_at
  ) values (
    p_reservation_id, p_workspace_id, p_amount_nanos, 'reserved',
    nullif(trim(coalesce(p_hold_ref_id, '')), ''), p_key_id,
    nullif(v_requested_count, 0), now(), now()
  );

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  update public.wallets
  set reserved_nanos = v_before_reserved + p_amount_nanos, updated_at = now()
  where workspace_id = p_workspace_id
  returning * into v_wallet;

  if p_key_id is not null then
    insert into public.gateway_requests (
      workspace_id, request_id, endpoint, model_id, provider,
      status_code, success, usage, cost_nanos, currency, key_id
    )
    select
      p_workspace_id,
      'batch_hold_usage:' || p_reservation_id || ':' || item::text,
      'batch',
      'batch/reserved',
      null,
      202,
      true,
      jsonb_build_object('batch_reserved', true),
      (p_amount_nanos / v_requested_count)
        + case when item <= (p_amount_nanos % v_requested_count) then 1 else 0 end,
      'USD',
      p_key_id
    from generate_series(1, v_requested_count) as item
    ;
  end if;

  return query select true, true, null::text, p_amount_nanos,
    v_before_balance, coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved, coalesce(v_wallet.reserved_nanos, 0);
end;
$$;

revoke all on function public.gateway_wallet_reserve_once(uuid, text, bigint, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.gateway_wallet_reserve_once(uuid, text, bigint, text, uuid, integer)
  to service_role;

create table if not exists public.gateway_batch_key_usage_records (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id text not null,
  custom_id text not null,
  key_id uuid not null references public.keys(id) on delete cascade,
  provider text null,
  endpoint text not null,
  model text not null,
  cost_nanos bigint not null check (cost_nanos >= 0),
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, batch_id, custom_id)
);

alter table public.gateway_batch_key_usage_records enable row level security;
grant select, insert on public.gateway_batch_key_usage_records to service_role;

create or replace function public.gateway_record_batch_key_usage(
  p_workspace_id uuid,
  p_key_id uuid,
  p_batch_id text,
  p_provider text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if p_workspace_id is null or p_key_id is null or coalesce(trim(p_batch_id), '') = '' then
    raise exception 'invalid_batch_key_usage_identity';
  end if;
  if not exists (
    select 1 from public.keys
    where id = p_key_id and workspace_id = p_workspace_id
  ) then
    raise exception 'batch_key_not_owned_by_workspace';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_batch_key_usage_rows';
  end if;

  delete from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.key_id = p_key_id
    and gr.request_id like 'batch_hold_usage:%'
    and exists (
      select 1
      from public.gateway_wallet_reservations reservation
      where reservation.workspace_id = p_workspace_id
        and reservation.key_id = p_key_id
        and reservation.capture_ref_id = p_batch_id
        and reservation.status = 'captured'
        and gr.request_id like 'batch_hold_usage:' || reservation.reservation_id || ':%'
    );

  with source_rows as (
    select
      coalesce(nullif(trim(row ->> 'custom_id'), ''), ordinality::text) as custom_id,
      coalesce(nullif(trim(row ->> 'endpoint'), ''), 'batch') as endpoint,
      coalesce(nullif(trim(row ->> 'model'), ''), 'batch/unknown') as model,
      greatest(0, coalesce((row ->> 'cost_nanos')::bigint, 0)) as cost_nanos,
      case when jsonb_typeof(row -> 'usage') = 'object' then row -> 'usage' else '{}'::jsonb end as usage
    from jsonb_array_elements(p_rows) with ordinality as entries(row, ordinality)
  ), claimed_rows as (
    insert into public.gateway_batch_key_usage_records (
      workspace_id, batch_id, custom_id, key_id, provider, endpoint, model, cost_nanos, usage
    )
    select
      p_workspace_id, p_batch_id, source.custom_id, p_key_id,
      nullif(trim(coalesce(p_provider, '')), ''), source.endpoint,
      source.model, source.cost_nanos, source.usage
    from source_rows source
    on conflict (workspace_id, batch_id, custom_id) do nothing
    returning custom_id, provider, endpoint, model, cost_nanos, usage
  )
  insert into public.gateway_requests (
    workspace_id, request_id, endpoint, model_id, provider,
    status_code, success, usage, cost_nanos, currency, key_id
  )
  select
    p_workspace_id,
    'batch_usage:' || p_batch_id || ':' || claimed.custom_id,
    claimed.endpoint,
    claimed.model,
    claimed.provider,
    200,
    true,
    claimed.usage,
    claimed.cost_nanos,
    'USD',
    p_key_id
  from claimed_rows claimed;
  get diagnostics v_inserted = row_count;

  update public.gateway_wallet_reservations
  set key_usage_recorded_at = coalesce(key_usage_recorded_at, now()), updated_at = now()
  where workspace_id = p_workspace_id
    and key_id = p_key_id
    and capture_ref_id = p_batch_id
    and status = 'captured';

  return v_inserted;
end;
$$;

revoke all on function public.gateway_record_batch_key_usage(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.gateway_record_batch_key_usage(uuid, uuid, text, text, jsonb)
  to service_role;

-- Synchronous charges must never consume funds held for async work.
create or replace function public.deduct_and_check_top_up(
  p_workspace_id uuid,
  p_cost_nanos bigint
)
returns json
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_new_balance bigint;
  v_low_threshold bigint;
  v_auto_top_up_amount bigint;
  v_auto_top_up_enabled boolean;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
begin
  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;
  update public.wallets
  set balance_nanos = balance_nanos - p_cost_nanos
  where workspace_id = p_workspace_id
    and balance_nanos - p_cost_nanos >= coalesce(reserved_nanos, 0)
  returning balance_nanos, low_balance_threshold, auto_top_up_amount,
    auto_top_up_enabled, auto_top_up_account_id, stripe_customer_id
  into v_new_balance, v_low_threshold, v_auto_top_up_amount,
    v_auto_top_up_enabled, v_auto_top_up_account_id, v_stripe_customer_id;

  if v_new_balance is null then
    if exists (select 1 from public.wallets where workspace_id = p_workspace_id) then
      raise exception 'insufficient_unreserved_balance';
    end if;
    return json_build_object('status', 'wallet_not_found');
  end if;
  if v_auto_top_up_enabled and v_new_balance < v_low_threshold then
    return json_build_object(
      'status', 'top_up_required',
      'auto_top_up_amount_nanos', v_auto_top_up_amount,
      'auto_top_up_account_id', v_auto_top_up_account_id,
      'stripe_customer_id', v_stripe_customer_id,
      'new_balance_nanos', v_new_balance
    );
  end if;
  return json_build_object('status', 'top_up_not_required', 'new_balance_nanos', v_new_balance);
end;
$$;

revoke all on function public.deduct_and_check_top_up(uuid, bigint) from public, anon, authenticated;
grant execute on function public.deduct_and_check_top_up(uuid, bigint) to service_role;
