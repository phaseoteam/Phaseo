CREATE OR REPLACE FUNCTION public.gateway_wallet_reserve_once_without_workspace_budget(p_workspace_id uuid, p_reservation_id text, p_amount_nanos bigint, p_hold_ref_id text DEFAULT NULL::text, p_key_id uuid DEFAULT NULL::uuid, p_request_count integer DEFAULT NULL::integer)
 RETURNS TABLE(ok boolean, applied boolean, reason text, amount_nanos bigint, before_balance_nanos bigint, after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_video_exposure record;
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

    -- Video create audit rows have zero cost until completion. Count the unpaid
    -- portion of each reservation under the same key lock as admission. Captured
    -- reservations bridge the gap until the final request audit is persisted.
    -- Active holds remain exposure across budget-window boundaries.
    with exposure as (
      select r.created_at, r.status in ('held', 'reserved') as active,
        greatest(0, (case when r.status = 'captured'
          then coalesce(r.settled_amount_nanos, r.amount_nanos)
          else r.amount_nanos end) - coalesce(a.cost, 0)) as cost,
        case when coalesce(a.requests, 0) = 0 then 1 else 0 end as requests
      from public.gateway_wallet_reservations r
      left join lateral (
        select sum(gr.cost_nanos) as cost, count(*) as requests
        from public.gateway_requests gr
        where gr.workspace_id = r.workspace_id and gr.key_id = r.key_id
          and gr.request_id = r.hold_ref_id and gr.success is true
      ) a on true
      where r.workspace_id = p_workspace_id and r.key_id = p_key_id
        and r.reservation_id like 'video_hold:%'
        and r.status in ('held', 'reserved', 'captured')
        and (r.status in ('held', 'reserved') or r.created_at >= least(v_day_start, v_week_start, v_month_start))
    )
    select
      coalesce(sum(cost) filter (where active or created_at >= v_day_start), 0) as day_cost,
      coalesce(sum(cost) filter (where active or created_at >= v_week_start), 0) as week_cost,
      coalesce(sum(cost) filter (where active or created_at >= v_month_start), 0) as month_cost,
      coalesce(sum(requests) filter (where active or created_at >= v_day_start), 0) as day_requests,
      coalesce(sum(requests) filter (where active or created_at >= v_week_start), 0) as week_requests,
      coalesce(sum(requests) filter (where active or created_at >= v_month_start), 0) as month_requests
    into v_video_exposure from exposure;
    v_day_cost := v_day_cost + v_video_exposure.day_cost;
    v_week_cost := v_week_cost + v_video_exposure.week_cost;
    v_month_cost := v_month_cost + v_video_exposure.month_cost;
    v_day_requests := v_day_requests + v_video_exposure.day_requests;
    v_week_requests := v_week_requests + v_video_exposure.week_requests;
    v_month_requests := v_month_requests + v_video_exposure.month_requests;

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

  if p_key_id is not null and p_reservation_id not like 'video_hold:%' then
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
$function$;

revoke all on function public.gateway_wallet_reserve_once_without_workspace_budget(uuid,text,bigint,text,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.gateway_wallet_reserve_once_without_workspace_budget(uuid,text,bigint,text,uuid,integer)
  to service_role;

