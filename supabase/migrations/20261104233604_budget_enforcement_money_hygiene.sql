-- phaseo:allow-destructive-migration reason: TRUNCATE appears only in a REVOKE that removes it from anon and authenticated on gateway_wallet_reservations; no table or row is removed.
--
-- Budget enforcement and money hygiene:
-- 1. One budget usage calculation, private.budget_spend_items: positive-cost requests (whether or
--    not they succeeded), active holds in every period until they end, and captured video and
--    free-model holds less the cost audited for them, with each batch hold counted once.
--    gateway_workspace_budget_status uses it, and private.department_budget_usage applies it to
--    each department's keys for both gateway_department_budget_status and gateway_spend_limit_seed
--    (the SpendLimit Durable Object).
-- 2. gateway_department_budget_status gates batch and video holds (gateway_wallet_reserve_once),
--    realtime sessions (gateway_realtime_create_with_hold, gateway_realtime_extend_hold_once) and
--    the request-context fallback (gateway_fetch_request_context, gateway_fetch_request_context_bundle),
--    which also return the budgets that apply below their limit so the gateway does not cache them.
-- 3. gateway_wallet_reserve_once no longer row-locks workspace_budgets after the workspace
--    advisory lock (lock_workspace_budget_change takes them in the other order).
-- 4. deduct_and_check_top_up raises wallet_not_found instead of returning it, so the charge is not
--    recorded as applied.
-- 5. Drops public.wallet_apply_delta (no callers) and the credit_ledger INSERT policy for
--    authenticated, and revokes client writes on gateway_wallet_reservations and anon DELETE on wallets.
-- 6. I/O log retention is held at 90 days until extended retention is billed: longer settings are
--    set to 90 (with a NOTICE giving the count) before the check is added.
-- 7. The stale-hold reaper also releases video holds whose operation is missing, failed or cancelled,
--    or completed and billed, a day after the hold. This migration releases nothing itself.


CREATE OR REPLACE FUNCTION private.budget_spend_items (
  p_workspace_id        uuid,
  p_since               timestamp with time zone,
  p_key_ids             uuid[] DEFAULT NULL::uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    key_id uuid,
    at     timestamp with time zone,
    active boolean,
    nanos  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The spend that counts toward workspace and department budgets, one row per item, shared by
  -- gateway_workspace_budget_status and private.department_budget_usage (and so the spend-limit
  -- seed). A budget's usage is the sum of nanos over rows that are active or at/after its period
  -- start. p_key_ids limits the rows to those keys (NULL: the whole workspace). p_since (NULL: all
  -- time) bounds the history read; active holds are returned whenever they were made.
  --
  -- * Requests: every gateway_requests row with a positive cost, whether or not it succeeded (a
  --   cancelled or failed request can still be charged), except excluded request ids and the
  --   batch_hold_usage rows of a hold that is still active, which the hold itself counts.
  -- * Active holds (held or reserved), in every period until they end: video and free-model
  --   holds less the cost already audited for them, other holds (batch, realtime) less what was
  --   captured or released. Realtime holds carry no key; their session does.
  -- * Captured video and free-model holds made in the period, less the cost audited for them, so
  --   a capture counts before (or without) its request row and once after it lands.
  select request.key_id, request.created_at, false, request.cost_nanos
  from public.gateway_requests request
  where request.workspace_id = p_workspace_id
    and (p_key_ids is null or request.key_id = any (p_key_ids))
    and coalesce(request.cost_nanos, 0) > 0
    and (p_since is null or request.created_at >= p_since)
    and not (request.request_id = any (coalesce(p_exclude_request_ids, '{}'::text[])))
    and not (request.request_id like 'batch_hold_usage:%' and exists (
      select 1 from public.gateway_wallet_reservations hold
      where hold.workspace_id = request.workspace_id
        and hold.key_id = request.key_id
        and hold.status in ('held', 'reserved')
        and starts_with(request.request_id, 'batch_hold_usage:' || hold.reservation_id || ':')
    ))
  union all
  select coalesce(reservation.key_id, session.key_id), reservation.created_at,
    reservation.status in ('held', 'reserved'),
    case
      when reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%' then
        greatest(0, (case when reservation.status = 'captured'
          then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
          else reservation.amount_nanos end) - coalesce(audit.cost, 0))
      else greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
    end
  from public.gateway_wallet_reservations reservation
  left join public.gateway_realtime_sessions session
    on reservation.key_id is null
    and session.workspace_id = reservation.workspace_id
    and session.session_id = reservation.hold_ref_id
  left join lateral (
    select sum(request.cost_nanos) as cost
    from public.gateway_requests request
    where (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
      and request.workspace_id = reservation.workspace_id
      and request.key_id = reservation.key_id
      and request.request_id = reservation.hold_ref_id
      and coalesce(request.cost_nanos, 0) > 0
      and (reservation.reservation_id not like 'free_model_hold:%'
        or request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17))
  ) audit on true
  where reservation.workspace_id = p_workspace_id
    and (p_key_ids is null or coalesce(reservation.key_id, session.key_id) = any (p_key_ids))
    and (reservation.status in ('held', 'reserved')
      or (reservation.status = 'captured'
        and (reservation.reservation_id like 'video_hold:%' or reservation.reservation_id like 'free_model_hold:%')
        and (p_since is null or reservation.created_at >= p_since)));
$function$;

COMMENT ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[]) IS 'Spend items counted toward workspace and department budgets: positive-cost requests, active holds in every period, and captured video and free-model holds less their audited cost, with each hold''s batch_hold_usage rows counted once.';

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."budget_spend_items"(uuid, timestamp with time zone, uuid[], text[]) TO "postgres";

CREATE OR REPLACE FUNCTION private.department_budget_usage (
  p_workspace_id        uuid,
  p_key_id              uuid   DEFAULT NULL::uuid,
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    id              uuid,
    department_id   uuid,
    department_name text,
    budget_interval text,
    limit_nanos     bigint,
    period_start    timestamp with time zone,
    reset_at        timestamp with time zone,
    usage_nanos     bigint,
    key_ids         uuid[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Each department budget of the workspace (only the departments p_key_id counts toward, when
  -- given) with its usage this UTC period: the private.budget_spend_items of the department's keys
  -- (private.department_budget_key_departments), less excluded request ids. The one department
  -- usage calculation behind gateway_department_budget_status (admission) and
  -- gateway_spend_limit_seed (the SpendLimit Durable Object).
  with department_keys as materialized (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ), budgets as materialized (
    select b.id, b.department_id, d.name, b.interval, b.limit_nanos, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    join public.workspace_departments d on d.id = b.department_id
    cross join lateral private.spend_limit_period(b.interval, now()) p
    where b.workspace_id = p_workspace_id
      and (p_key_id is null or b.department_id in (
        select dk.department_id from department_keys dk where dk.key_id = p_key_id))
  ), items as materialized (
    select item.key_id, item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select min(budgets.period_start) from budgets),
      array(select distinct dk.key_id from department_keys dk where dk.department_id in (select budgets.department_id from budgets)),
      p_exclude_request_ids
    ) item
  )
  select budgets.id, budgets.department_id, budgets.name, budgets.interval, budgets.limit_nanos,
    budgets.period_start, budgets.reset_at,
    coalesce((
      select sum(items.nanos) from items
      where items.key_id in (select dk.key_id from department_keys dk where dk.department_id = budgets.department_id)
        and (items.active or items.at >= budgets.period_start)
    ), 0)::bigint,
    array(select dk.key_id from department_keys dk where dk.department_id = budgets.department_id order by dk.key_id)
  from budgets;
$function$;

COMMENT ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) IS 'Department budgets of a workspace with their usage this UTC period (private.budget_spend_items of the department''s keys) and keys; shared by gateway_department_budget_status and gateway_spend_limit_seed.';

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) TO "postgres";

CREATE OR REPLACE FUNCTION public.gateway_department_budget_status (
  p_workspace_id           uuid,
  p_key_id                 uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Admission check for the department budgets that p_key_id counts toward, the sibling of
-- gateway_workspace_budget_status. A budget blocks once its usage reaches the limit, or, with
-- p_requested_amount_nanos > 0, when usage plus the request would exceed it. Usage comes from
-- private.department_budget_usage, the same calculation gateway_spend_limit_seed gives the
-- SpendLimit Durable Object: positive-cost requests of the department's keys this UTC period plus
-- their outstanding holds. Used for batch, video and realtime holds and the request-context
-- fallback; department_budgets lists the budgets that apply even when none is reached.
declare
  v_now timestamptz := now();
  v_result jsonb;
  v_exceeded jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;
  if coalesce(p_requested_amount_nanos, 0) < 0 then
    raise exception 'requested_amount_must_be_non_negative';
  end if;
  if p_key_id is null or not exists (
    select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', usage.id,
    'department_id', usage.department_id,
    'department_name', usage.department_name,
    'interval', usage.budget_interval,
    'limit_nanos', usage.limit_nanos,
    'usage_nanos', usage.usage_nanos,
    'remaining_nanos', greatest(usage.limit_nanos - usage.usage_nanos, 0),
    'exceeded', case
      when coalesce(p_requested_amount_nanos, 0) > 0 then usage.usage_nanos + p_requested_amount_nanos > usage.limit_nanos
      else usage.usage_nanos >= usage.limit_nanos
    end,
    'window_start', usage.period_start,
    'reset_at', usage.reset_at
  ) order by case usage.budget_interval when 'daily' then 1 when 'weekly' then 2 else 3 end,
    usage.department_name, usage.department_id), '[]'::jsonb)
  into v_result
  from private.department_budget_usage(p_workspace_id, p_key_id, '{}'::text[]) usage;

  select budget into v_exceeded
  from jsonb_array_elements(v_result) with ordinality as item(budget, position)
  where (budget->>'exceeded')::boolean
  order by position
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'department_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'department_id', v_exceeded->'department_id',
      'department_name', v_exceeded->'department_name',
      'now', to_jsonb(v_now),
      'department_budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', v_result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) IS 'Admission check for the department budgets an API key counts toward (private.department_budget_usage: positive-cost requests plus outstanding holds this UTC period), with department_<window>_cost_budget_reached reasons and the applying budgets in department_budgets.';

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_workspace_budget_status (
  p_workspace_id           uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_now timestamptz := now();
  v_result jsonb;
  v_exceeded jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;
  if coalesce(p_requested_amount_nanos, 0) < 0 then
    raise exception 'requested_amount_must_be_non_negative';
  end if;

  with configured as (
    select
      budget.id,
      budget.workspace_id,
      budget.interval,
      budget.limit_nanos,
      budget.created_by,
      budget.created_at,
      budget.updated_at,
      case budget.interval
        when 'daily' then date_trunc('day', v_now at time zone 'utc') at time zone 'utc'
        when 'weekly' then date_trunc('week', v_now at time zone 'utc') at time zone 'utc'
        when 'monthly' then date_trunc('month', v_now at time zone 'utc') at time zone 'utc'
        else null
      end as window_start,
      case budget.interval
        when 'daily' then (date_trunc('day', v_now at time zone 'utc') + interval '1 day') at time zone 'utc'
        when 'weekly' then (date_trunc('week', v_now at time zone 'utc') + interval '1 week') at time zone 'utc'
        when 'monthly' then (date_trunc('month', v_now at time zone 'utc') + interval '1 month') at time zone 'utc'
        else null
      end as reset_at
    from public.workspace_budgets budget
    where budget.workspace_id = p_workspace_id
  ), items as materialized (
    -- private.budget_spend_items, as for department budgets: positive-cost requests, active holds
    -- in every period, captured video and free-model holds less their audited cost.
    select item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select case when bool_or(configured.window_start is null) then null else min(configured.window_start) end from configured)
    ) item
    where exists (select 1 from configured)
  ), usage_rows as (
    select
      configured.*,
      coalesce((
        select sum(items.nanos) from items
        where items.active or configured.window_start is null or items.at >= configured.window_start
      ), 0)::bigint as usage_nanos
    from configured
  ), normalized as (
    select *,
      usage_nanos + coalesce(p_requested_amount_nanos, 0) as projected_usage_nanos,
      greatest(limit_nanos - usage_nanos, 0) as remaining_nanos,
      case
        when coalesce(p_requested_amount_nanos, 0) > 0
          then usage_nanos + p_requested_amount_nanos > limit_nanos
        else usage_nanos >= limit_nanos
      end as exceeded
    from usage_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'workspace_id', workspace_id,
    'interval', interval,
    'limit_nanos', limit_nanos,
    'usage_nanos', usage_nanos,
    'remaining_nanos', remaining_nanos,
    'projected_usage_nanos', projected_usage_nanos,
    'exceeded', exceeded,
    'window_start', window_start,
    'reset_at', reset_at,
    'created_by', created_by,
    'created_at', created_at,
    'updated_at', updated_at
  ) order by case interval when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end), '[]'::jsonb)
  into v_result
  from normalized;

  select budget
  into v_exceeded
  from jsonb_array_elements(v_result) budget
  where (budget->>'exceeded')::boolean
  order by case budget->>'interval' when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'workspace_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'now', to_jsonb(v_now),
      'budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'budgets', v_result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_spend_limit_seed (
  p_workspace_id        uuid,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  -- Windows and filters must stay identical to the key-limit accounting in
  -- public.gateway_fetch_request_context_without_workspace_budget.
  now_utc     timestamptz := (now() at time zone 'utc');
  day_start   timestamptz := date_trunc('day',  now_utc);
  week_start  timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start timestamptz := date_trunc('month', now_utc);
  v_key_ids   uuid[] := coalesce(p_key_ids, '{}'::uuid[]);
  v_exclude   text[] := coalesce(p_exclude_request_ids, '{}'::text[]);
  v_keys      jsonb;
  v_excluded  jsonb := '[]'::jsonb;
  v_departments jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null then
    raise exception using errcode = '22023', message = 'workspace_id_required';
  end if;
  if cardinality(v_key_ids) > 100 then
    raise exception using errcode = '22023', message = 'too_many_key_ids';
  end if;
  if cardinality(v_exclude) > 5000 then
    raise exception using errcode = '22023', message = 'too_many_excluded_request_ids';
  end if;

  with key_rows as (
    select
      k.id,
      k.status,
      coalesce(k.soft_blocked, false) as soft_blocked,
      k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos,
      -- Unlimited keys need no history read, as in the context function.
      coalesce(greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0, false) as limited
    from public.keys k
    where k.id = any(v_key_ids)
      and k.workspace_id = p_workspace_id
  ), usage as (
    select
      gr.key_id,
      count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
      count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
      count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
    from public.gateway_requests gr
    where gr.key_id = any(array(select key_rows.id from key_rows where key_rows.limited))
      and gr.workspace_id = p_workspace_id
      and gr.success is true
      and gr.created_at >= least(week_start, month_start)
      and not (gr.request_id = any(v_exclude))
    group by gr.key_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key_id', key_rows.id,
    'active', key_rows.status = 'active',
    'soft_blocked', key_rows.soft_blocked,
    'limited', key_rows.limited,
    'limits', jsonb_build_object(
      'daily',   jsonb_build_object('requests', key_rows.daily_limit_requests,   'cost_nanos', key_rows.daily_limit_cost_nanos),
      'weekly',  jsonb_build_object('requests', key_rows.weekly_limit_requests,  'cost_nanos', key_rows.weekly_limit_cost_nanos),
      'monthly', jsonb_build_object('requests', key_rows.monthly_limit_requests, 'cost_nanos', key_rows.monthly_limit_cost_nanos)
    ),
    'used', case when key_rows.limited then jsonb_build_object(
      'daily',   jsonb_build_object('requests', coalesce(usage.used_day_reqs, 0), 'cost_nanos', coalesce(usage.used_day_cost, 0)),
      'weekly',  jsonb_build_object('requests', coalesce(usage.used_wk_reqs, 0),  'cost_nanos', coalesce(usage.used_wk_cost, 0)),
      'monthly', jsonb_build_object('requests', coalesce(usage.used_mo_reqs, 0),  'cost_nanos', coalesce(usage.used_mo_cost, 0))
    ) else null end
  ) order by key_rows.id), '[]'::jsonb)
  into v_keys
  from key_rows
  left join usage on usage.key_id = key_rows.id;

  -- Department budgets with their usage this UTC period and every key that counts toward each
  -- department, from private.department_budget_usage, the calculation gateway_department_budget_status
  -- admits holds with: positive-cost requests of the department's keys (less excluded request ids)
  -- plus their outstanding batch, video and realtime holds.
  if exists (select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', usage.id,
      'department_id', usage.department_id,
      'department_name', usage.department_name,
      'interval', usage.budget_interval,
      'limit_nanos', usage.limit_nanos,
      'usage_nanos', usage.usage_nanos,
      'window_start', usage.period_start,
      'reset_at', usage.reset_at,
      'key_ids', to_jsonb(usage.key_ids)
    ) order by usage.department_id, usage.budget_interval), '[]'::jsonb)
    into v_departments
    from private.department_budget_usage(p_workspace_id, null, v_exclude) usage;
  end if;

  -- Excluded requests that are already persisted, so the caller can stop
  -- tracking them separately and count the stored row instead.
  if cardinality(v_exclude) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', gr.request_id,
      'key_id', gr.key_id,
      'success', gr.success,
      'cost_nanos', coalesce(gr.cost_nanos, 0),
      'created_at', gr.created_at
    ) order by gr.request_id, gr.created_at), '[]'::jsonb)
    into v_excluded
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.request_id = any(v_exclude)
      and gr.created_at >= least(week_start, month_start) - interval '1 day';
  end if;

  return jsonb_build_object(
    'now', to_jsonb(now_utc),
    'day_start', to_jsonb(day_start),
    'week_start', to_jsonb(week_start),
    'month_start', to_jsonb(month_start),
    'keys', v_keys,
    'budget_status', public.gateway_workspace_budget_status(p_workspace_id, 0),
    'excluded_rows', v_excluded,
    'department_budgets', v_departments
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) IS 'Seeds the gateway spend-limit coordinator: per-key day/week/month usage with the request-context windows and filters (excluding already-recorded request ids), plus workspace budget status and department budgets with their usage and keys.';

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_reserve_once (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_amount_nanos   bigint,
  p_hold_ref_id    text    DEFAULT NULL::text,
  p_key_id         uuid    DEFAULT NULL::uuid,
  p_request_count  integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    ok                    boolean,
    applied               boolean,
    reason                text,
    amount_nanos          bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
  v_department_status jsonb;
  v_balance_nanos bigint;
  v_reserved_nanos bigint;
begin
  -- Serializes holds with each other and with budget changes: the lock_workspace_budget_change
  -- trigger takes the same lock on every write to workspace_budgets and
  -- workspace_department_budgets. No budget row lock here, which would invert that order.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));

  if not exists (
    select 1 from public.gateway_wallet_reservations
    where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  ) then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_amount_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      return query select false, false, (v_budget_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    v_department_status := public.gateway_department_budget_status(p_workspace_id, p_key_id, p_amount_nanos);
    if not coalesce((v_department_status->>'ok')::boolean, true) then
      return query select false, false, (v_department_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    if p_reservation_id like 'video_hold:%' or p_reservation_id like 'batch_hold:%' then
      select coalesce(wallet.balance_nanos, 0), coalesce(wallet.reserved_nanos, 0)
      into v_balance_nanos, v_reserved_nanos
      from public.wallets wallet
      where wallet.workspace_id = p_workspace_id
      for update;
      if found and v_balance_nanos - v_reserved_nanos < 1000000000 then
        return query select false, false, 'insufficient_funds'::text, p_amount_nanos,
          v_balance_nanos, v_balance_nanos, v_reserved_nanos, v_reserved_nanos;
        return;
      end if;
    end if;
  end if;

  return query
  select * from public.gateway_wallet_reserve_once_without_workspace_budget(
    p_workspace_id, p_reservation_id, p_amount_nanos, p_hold_ref_id, p_key_id, p_request_count
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_create_with_hold (
  p_workspace_id             uuid,
  p_session_id               text,
  p_key_id                   uuid,
  p_user_id                  text,
  p_source                   text,
  p_provider                 text,
  p_model_id                 text,
  p_provider_model_id        text,
  p_voice                    text,
  p_expires_at               timestamp with time zone,
  p_reservation_prefix       text,
  p_reservation_id           text,
  p_hold_nanos               bigint,
  p_client_secret_hash       text,
  p_metadata                 jsonb                    DEFAULT '{}'::jsonb,
  p_max_workspace_sessions   integer                  DEFAULT 8,
  p_max_key_sessions         integer                  DEFAULT 4,
  p_max_user_sessions        integer                  DEFAULT 1,
  p_max_creations_per_minute integer                  DEFAULT 8
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_hold_nanos);
  if not coalesce((v_budget_status->>'ok')::boolean, true) then
    raise exception '%', v_budget_status->>'reason';
  end if;
  v_budget_status := public.gateway_department_budget_status(p_workspace_id, p_key_id, p_hold_nanos);
  if not coalesce((v_budget_status->>'ok')::boolean, true) then
    raise exception '%', v_budget_status->>'reason';
  end if;

  return query select * from public.gateway_realtime_create_with_hold_without_workspace_budget(
    p_workspace_id, p_session_id, p_key_id, p_user_id, p_source, p_provider,
    p_model_id, p_provider_model_id, p_voice, p_expires_at, p_reservation_prefix,
    p_reservation_id, p_hold_nanos, p_client_secret_hash, p_metadata,
    p_max_workspace_sessions, p_max_key_sessions, p_max_user_sessions,
    p_max_creations_per_minute
  );
end;
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."gateway_realtime_create_with_hold"(uuid, text, uuid, text, text, text, text, text, text, timestamp
    WITH time zone, text, text, bigint, text, jsonb, integer, integer, integer, integer)
  FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_extend_hold_once (
  p_workspace_id          uuid,
  p_session_id            text,
  p_reservation_id        text,
  p_target_reserved_nanos bigint,
  p_estimated_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_current_reserved_nanos bigint;
  v_key_id uuid;
  v_additional_nanos bigint;
  v_budget_status jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select reserved_nanos, key_id into v_current_reserved_nanos, v_key_id
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then raise exception 'realtime_session_not_found'; end if;

  v_additional_nanos := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_current_reserved_nanos, 0));
  if v_additional_nanos > 0 then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, v_additional_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      raise exception '%', v_budget_status->>'reason';
    end if;
    v_budget_status := public.gateway_department_budget_status(p_workspace_id, v_key_id, v_additional_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      raise exception '%', v_budget_status->>'reason';
    end if;
  end if;

  return query select * from public.gateway_realtime_extend_hold_once_without_workspace_budget(
    p_workspace_id, p_session_id, p_reservation_id, p_target_reserved_nanos,
    p_estimated_cost_nanos
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once"(uuid, text, text, bigint, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context (
  workspace_id uuid,
  model        text,
  endpoint     text,
  api_key_id   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget_status jsonb;
begin
  v_context := public.gateway_fetch_request_context_without_workspace_budget(workspace_id, model, endpoint, api_key_id);
  v_budget_status := public.gateway_workspace_budget_status(workspace_id, 0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean, true)
    and not coalesce((v_budget_status->>'ok')::boolean, true) then
    v_context := jsonb_set(v_context, '{key_limit_ok}', v_budget_status, true);
  end if;
  -- Department budgets, for when the SpendLimit Durable Object cannot decide. Budgets that apply
  -- are returned even below their limit, so the gateway never caches this admission.
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean, true) then
    v_budget_status := public.gateway_department_budget_status(workspace_id, api_key_id, 0);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      v_context := jsonb_set(v_context, '{key_limit_ok}', v_budget_status, true);
    elsif jsonb_array_length(coalesce(v_budget_status->'department_budgets', '[]'::jsonb)) > 0 then
      v_context := jsonb_set(v_context, '{key_limit_ok,department_budgets}', v_budget_status->'department_budgets', true);
    end if;
  end if;
  return v_context;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) IS 'V2 gateway request context with current and historical workspace publisher handle resolution.';

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context"(uuid, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_fetch_request_context_bundle (
  workspace_id    uuid,
  model           text,
  endpoint        text,
  api_key_id      uuid,
  include_catalog boolean DEFAULT true
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_context jsonb;
  v_budget jsonb;
  v_department jsonb;
  v_byok jsonb;
  v_settings jsonb;
  v_billing text;
  v_catalog jsonb;
  v_endpoints text[];
begin
  if model like '@%' or endpoint not in ('responses','chat.completions','messages','text.generate') then
    raise exception 'unsupported_context_bundle' using errcode='22023';
  end if;
  v_context := private.gateway_context_access(workspace_id,model,endpoint,api_key_id);
  v_budget := public.gateway_workspace_budget_status(workspace_id,0);
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) and not coalesce((v_budget->>'ok')::boolean,true) then
    v_context := jsonb_set(v_context,'{key_limit_ok}',v_budget,true);
  end if;
  -- Department budgets, for when the SpendLimit Durable Object cannot decide. Budgets that apply
  -- are returned even below their limit, so Workers never reuse this admission snapshot.
  if coalesce((v_context->'key_limit_ok'->>'ok')::boolean,true) then
    v_department := public.gateway_department_budget_status(workspace_id,api_key_id,0);
    if not coalesce((v_department->>'ok')::boolean,true) then
      v_context := jsonb_set(v_context,'{key_limit_ok}',v_department,true);
    elsif jsonb_array_length(coalesce(v_department->'department_budgets','[]'::jsonb))>0 then
      v_context := jsonb_set(v_context,'{key_limit_ok,department_budgets}',v_department->'department_budgets',true);
    end if;
  end if;
  -- Return configured workspace budgets even when below their limit, so Workers
  -- never reuse an admission snapshot for a workspace with a spending cap.
  if jsonb_array_length(coalesce(v_budget->'budgets','[]'::jsonb))>0 then
    v_context := jsonb_set(v_context,'{key_limit_ok,budgets}',v_budget->'budgets',true);
  end if;
  select coalesce(jsonb_object_agg(provider_id,items),'{}'::jsonb) into v_byok from (
    select bk.provider_id,jsonb_agg(jsonb_build_object('provider_id',bk.provider_id,'id',bk.id,
      'fingerprint_sha256',bk.fingerprint_sha256,'key_version',bk.key_version,'always_use',bk.always_use)) as items
    from public.byok_keys bk where bk.workspace_id=gateway_fetch_request_context_bundle.workspace_id and bk.enabled
    group by bk.provider_id
  ) byok;
  select jsonb_build_object(
    'routing_mode',s.routing_mode,'byok_fallback_enabled',s.byok_fallback_enabled,'beta_channel_enabled',s.beta_channel_enabled,
    'alpha_channel_enabled',s.alpha_channel_enabled,'cache_aware_routing_enabled',s.cache_aware_routing_enabled,
    'privacy_zdr_only',s.privacy_zdr_only,'privacy_enable_paid_may_train',s.privacy_enable_paid_may_train,
    'privacy_enable_free_may_train',s.privacy_enable_free_may_train,'privacy_enable_input_output_logging',s.privacy_enable_input_output_logging,
    'io_logging_enabled',s.io_logging_enabled,'io_logging_include_provider_payloads',s.io_logging_include_provider_payloads,
    'data_contribution_enabled',s.data_contribution_enabled,'data_contribution_policy_version',s.data_contribution_policy_version,
    'data_contribution_sample_rate_bps',s.data_contribution_sample_rate_bps,'data_contribution_classifier_sample_rate_bps',s.data_contribution_classifier_sample_rate_bps,
    'data_contribution_discount_bps',s.data_contribution_discount_bps,'response_healing_enabled',s.response_healing_enabled,
    'response_healing_locked',s.response_healing_locked,'response_healing_mode',s.response_healing_mode
  ) into v_settings from public.workspace_settings s where s.workspace_id=gateway_fetch_request_context_bundle.workspace_id;
  select billing_mode into v_billing from public.workspaces where id=workspace_id;
  if v_settings is null or v_billing is null or v_billing not in ('wallet','invoice') then
    raise exception 'workspace_context_enrichment_missing';
  end if;
  v_endpoints := case when endpoint='text.generate' then array['text.generate'] else array['text.generate',endpoint] end;
  if include_catalog then v_catalog := public.gateway_fetch_public_catalog(model,v_endpoints); end if;
  return jsonb_build_object('context',v_context,'byok',v_byok,'settings',v_settings,'billingMode',v_billing,'catalog',v_catalog);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_fetch_request_context_bundle"(uuid, text, text, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.deduct_and_check_top_up (
  p_workspace_id uuid,
  p_cost_nanos   bigint
)
  RETURNS json
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_new_balance bigint;
  v_overdraft_nanos bigint;
  v_low boolean;
  v_trigger_top_up boolean;
begin
  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  -- Nothing was debited, so the caller must not record this charge as applied.
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- The request has already been served, so its real cost is always charged.
  -- When it is more than the unreserved balance the wallet goes into overdraft
  -- (balance below reserved, or below zero); admission then blocks the
  -- workspace until it is topped up. overdraft_nanos is the part of this cost
  -- that the unreserved balance did not cover.
  v_new_balance := v_wallet.balance_nanos - p_cost_nanos;
  v_overdraft_nanos := greatest(0, p_cost_nanos - greatest(0, v_wallet.balance_nanos - coalesce(v_wallet.reserved_nanos, 0)));

  -- One auto top-up at a time: the marker is set under this row lock and
  -- cleared when the top-up is credited, or expires after 15 minutes.
  v_low := v_wallet.auto_top_up_enabled and v_new_balance < v_wallet.low_balance_threshold;
  v_trigger_top_up := v_low and (
    v_wallet.auto_top_up_in_flight_until is null or v_wallet.auto_top_up_in_flight_until <= now()
  );

  update public.wallets
  set balance_nanos = v_new_balance,
      auto_top_up_in_flight_until = case
        when v_trigger_top_up then now() + interval '15 minutes'
        else auto_top_up_in_flight_until
      end
  where workspace_id = p_workspace_id;

  if v_trigger_top_up then
    return json_build_object(
      'status', 'top_up_required',
      'auto_top_up_amount_nanos', v_wallet.auto_top_up_amount,
      'auto_top_up_account_id', v_wallet.auto_top_up_account_id,
      'stripe_customer_id', v_wallet.stripe_customer_id,
      'new_balance_nanos', v_new_balance,
      'overdraft_nanos', v_overdraft_nanos
    );
  end if;
  if v_low then
    return json_build_object('status', 'top_up_pending', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
  end if;
  return json_build_object('status', 'top_up_not_required', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_release_stale_orphan_batch_reservations (
  p_older_than_seconds integer DEFAULT 1800,
  p_limit              integer DEFAULT 100
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_released integer := 0;
begin
  -- Batch holds with no batch operation, and video holds at least a day old whose video
  -- operation is missing, failed or cancelled, or completed and already billed. A video still
  -- queued or running, or completed but not billed, keeps its hold for billing to settle.
  for v_reservation in
    select reservation.*
    from public.gateway_wallet_reservations reservation
    where reservation.status in ('held', 'reserved')
      and (
        (reservation.reservation_id like 'batch_hold:%'
          and reservation.created_at < now() - make_interval(secs => greatest(300, p_older_than_seconds))
          and not exists (
            select 1
            from public.gateway_async_operations operation
            where operation.workspace_id = reservation.workspace_id
              and operation.kind = 'batch'
              and (
                operation.request_id = reservation.hold_ref_id
                or operation.meta ->> 'reservationId' = reservation.reservation_id
                or operation.meta ->> 'reservation_id' = reservation.reservation_id
              )
          ))
        or (reservation.reservation_id like 'video_hold:%'
          and reservation.created_at < now() - make_interval(secs => greatest(86400, p_older_than_seconds))
          and not exists (
            select 1
            from public.gateway_async_operations operation
            where operation.workspace_id = reservation.workspace_id
              and operation.kind = 'video'
              and (
                operation.request_id = reservation.hold_ref_id
                or operation.meta ->> 'reservationId' = reservation.reservation_id
                or operation.meta ->> 'reservation_id' = reservation.reservation_id
              )
              and not (
                operation.status in ('failed', 'cancelled', 'canceled', 'expired')
                or (operation.status = 'completed' and operation.billed_at is not null)
              )
          ))
      )
    order by reservation.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 1000))
  loop
    update public.wallets
    set reserved_nanos = greatest(0, coalesce(reserved_nanos, 0) - v_reservation.amount_nanos),
        updated_at = now()
    where workspace_id = v_reservation.workspace_id
      and coalesce(reserved_nanos, 0) >= v_reservation.amount_nanos;

    if found then
      update public.gateway_wallet_reservations
      set status = 'released',
          release_ref_id = case when v_reservation.reservation_id like 'video_hold:%'
            then 'stale_orphan_video_reaper' else 'stale_orphan_batch_reaper' end,
          released_at = now(),
          updated_at = now()
      where workspace_id = v_reservation.workspace_id
        and reservation_id = v_reservation.reservation_id;
      v_released := v_released + 1;
    end if;
  end loop;
  return v_released;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_release_stale_orphan_batch_reservations"(integer, integer) FROM PUBLIC, "anon", "authenticated";

DROP FUNCTION IF EXISTS public.wallet_apply_delta(uuid, bigint);

DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.credit_ledger;

REVOKE DELETE ON TABLE public.wallets FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.gateway_wallet_reservations FROM anon, authenticated;

DO $normalize$
declare
  v_count integer;
begin
  update public.workspace_settings
  set io_logging_retention_days = 90
  where io_logging_retention_days is distinct from 90;
  get diagnostics v_count = row_count;
  raise notice 'io_logging_retention_days set to 90 on % workspace_settings row(s)', v_count;
end
$normalize$;

ALTER TABLE public.workspace_settings
  DROP CONSTRAINT IF EXISTS workspace_settings_io_logging_retention_days_check,
  ADD CONSTRAINT workspace_settings_io_logging_retention_days_check CHECK ((io_logging_retention_days = 90));

COMMENT ON TABLE "public"."workspace_department_budgets" IS 'Department spend budgets. A department''s spend is what its linked API keys cost, plus the keys and OAuth requests of its members when the key is not linked to a department. Budgets block the department''s requests, batch and video holds and realtime sessions once its spend reaches 100% (gateway_department_budget_status) and send alerts at about 80% and 100% (sweep_department_budget_alerts).';
