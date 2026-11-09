-- Guardrail levels, phase D (first pass): spend guardrails.
-- 1. A spend guardrail (kind 'spend') holds a cost limit (spend_limit_nanos), a UTC period
--    (spend_period: daily, weekly or monthly), what happens at the limit (spend_action: notify or
--    block) and how it counts (spend_counting):
--      shared    one counter for each assignment: the whole workspace, a department, all of a
--                member's keys, or one key;
--      each_key  a separate counter for each key it covers.
--    A spend guardrail sets nothing else, and only spend guardrails set these columns. None of
--    them has a default: whoever makes the guardrail picks each one.
-- 2. private.spend_guardrail_usage lists the counters, with their keys and spend this period.
-- 3. The gateway's spend-limit coordinator enforces blocking spend guardrails: the seed
--    (gateway_spend_limit_seed) lists their counters next to department budgets.
-- 4. public.sweep_spend_guardrail_alerts pushes at 80% and 100% of every spend guardrail's limit,
--    like department budget alerts.
-- Workspace and department budgets are unchanged. Nothing is deleted, and nothing is dropped.

SET local check_function_bodies = off;

-- ---- 1. spend columns
ALTER TABLE "public"."workspace_guardrails"
  ADD COLUMN "spend_limit_nanos" bigint,
  ADD COLUMN "spend_period" text,
  ADD COLUMN "spend_action" text,
  ADD COLUMN "spend_counting" text,
  ADD CONSTRAINT "workspace_guardrails_spend_limit_nanos_check" CHECK (((spend_limit_nanos IS NULL) OR (spend_limit_nanos > 0))),
  ADD CONSTRAINT "workspace_guardrails_spend_period_check" CHECK (((spend_period IS NULL) OR (spend_period = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))),
  ADD CONSTRAINT "workspace_guardrails_spend_action_check" CHECK (((spend_action IS NULL) OR (spend_action = ANY (ARRAY['notify'::text, 'block'::text])))),
  ADD CONSTRAINT "workspace_guardrails_spend_counting_check" CHECK (((spend_counting IS NULL) OR (spend_counting = ANY (ARRAY['shared'::text, 'each_key'::text])))),
  ADD CONSTRAINT "workspace_guardrails_spend_kind_check" CHECK ((((kind = 'spend'::text) AND (num_nonnulls(spend_limit_nanos, spend_period, spend_action, spend_counting) = 4) AND privacy_enable_paid_may_train AND privacy_enable_free_may_train AND privacy_enable_free_may_publish_prompts AND privacy_enable_input_output_logging AND (NOT privacy_zdr_only) AND (provider_restriction_mode = 'none'::text) AND (model_restriction_mode = 'none'::text) AND (NOT prompt_injection_enabled) AND (NOT sensitive_info_enabled)) OR ((kind <> 'spend'::text) AND (num_nonnulls(spend_limit_nanos, spend_period, spend_action, spend_counting) = 0))));

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_limit_nanos" IS 'A spend guardrail''s cost limit for each period, in nanodollars.';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_period" IS 'The UTC period a spend guardrail counts over: daily, weekly (from Monday) or monthly.';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_action" IS 'What a spend guardrail does at its limit: notify (pushes at 80% and 100%) or block (the same pushes, and the gateway refuses the API-key requests it covers until the period resets).';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_counting" IS 'How a spend guardrail counts: shared (one counter for each assignment, over every key it covers) or each_key (one counter for each key it covers).';

-- ---- 2. counters
CREATE OR REPLACE FUNCTION private.spend_guardrail_usage (
  p_workspace_id        uuid,
  p_now                 timestamp with time zone,
  p_exclude_request_ids text[] DEFAULT '{}'::text[],
  p_action              text DEFAULT NULL::text
)
  RETURNS TABLE (
    guardrail_id   uuid,
    guardrail_name text,
    spend_period   text,
    spend_action   text,
    spend_counting text,
    limit_nanos    bigint,
    counter        text,
    key_ids        uuid[],
    usage_nanos    bigint,
    period_start   timestamp with time zone,
    reset_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Every spend counter of the workspace's enabled spend guardrails (only those whose action is
  -- p_action, when given), with the keys that count toward it and their spend this UTC period.
  -- A key is covered where public.resolve_key_guardrails says the guardrail applies to it.
  -- A shared guardrail has one counter per assignment (counter 'workspace:', 'department:<id>',
  -- 'member:<id>' or 'key:<id>'), over every key that assignment covers; an each_key guardrail has
  -- one counter per covered key ('key:<id>'). Spend is counted like key cost limits: successful
  -- gateway_requests rows of those keys since the period start, less p_exclude_request_ids.
  with spend_guardrails as (
    select g.id, g.name, g.spend_period, g.spend_action, g.spend_counting, g.spend_limit_nanos
    from public.workspace_guardrails g
    where g.workspace_id = p_workspace_id
      and g.kind = 'spend'
      and g.enabled
      and (p_action is null or g.spend_action = p_action)
  ),
  covered as (
    select distinct
      sg.id as guardrail_id,
      case when sg.spend_counting = 'each_key' then 'key:' || k.id::text
        else r.source_type || ':' || coalesce(r.source_id::text, '') end as counter,
      k.id as key_id
    from public.keys k
    cross join lateral public.resolve_key_guardrails(p_workspace_id, k.id) r
    join spend_guardrails sg on sg.id = r.guardrail_id
    where k.workspace_id = p_workspace_id
      and exists (select 1 from spend_guardrails)
  ),
  counters as (
    select covered.guardrail_id, covered.counter, array_agg(covered.key_id order by covered.key_id) as key_ids
    from covered
    group by covered.guardrail_id, covered.counter
  )
  select
    sg.id,
    sg.name,
    sg.spend_period,
    sg.spend_action,
    sg.spend_counting,
    sg.spend_limit_nanos,
    c.counter,
    c.key_ids,
    coalesce((
      select sum(coalesce(gr.cost_nanos, 0))
      from public.gateway_requests gr
      where gr.workspace_id = p_workspace_id
        and gr.key_id = any(c.key_ids)
        and gr.success is true
        and gr.created_at >= p.period_start
        and not (gr.request_id = any(coalesce(p_exclude_request_ids, '{}'::text[])))
    ), 0)::bigint,
    p.period_start,
    p.reset_at
  from counters c
  join spend_guardrails sg on sg.id = c.guardrail_id
  cross join lateral private.spend_limit_period(sg.spend_period, p_now) p
  order by sg.name, sg.id, c.counter;
$function$;

COMMENT ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) IS 'Spend counters of a workspace''s enabled spend guardrails: one per assignment when shared, one per covered key when each_key, with their keys and successful gateway_requests cost this UTC period.';

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_guardrail_usage"(uuid, timestamp with time zone, text[], text) TO "service_role";

-- ---- 3. coordinator seed
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
  v_guardrails jsonb := '[]'::jsonb;
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

  -- Department budgets with their usage this UTC period, counted like key usage (successful
  -- gateway_requests rows of the department's keys, less excluded request ids), and every key
  -- that counts toward each department (private.department_budget_key_departments).
  if exists (select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id) then
    with department_keys as (
      select kd.key_id, kd.department_id
      from private.department_budget_key_departments(p_workspace_id) kd
    ), budgets as (
      select b.id, b.department_id, d.name as department_name, b.interval, b.limit_nanos, p.period_start, p.reset_at
      from public.workspace_department_budgets b
      join public.workspace_departments d on d.id = b.department_id
      cross join lateral private.spend_limit_period(b.interval, now()) p
      where b.workspace_id = p_workspace_id
    ), spend as (
      select gr.key_id, gr.created_at, coalesce(gr.cost_nanos, 0) as cost_nanos
      from public.gateway_requests gr
      where gr.key_id in (select department_keys.key_id from department_keys)
        and gr.workspace_id = p_workspace_id
        and gr.success is true
        and gr.created_at >= (select min(budgets.period_start) from budgets)
        and not (gr.request_id = any(v_exclude))
    ), usage as (
      select budgets.id, coalesce(sum(spend.cost_nanos), 0)::bigint as usage_nanos
      from budgets
      left join department_keys on department_keys.department_id = budgets.department_id
      left join spend on spend.key_id = department_keys.key_id and spend.created_at >= budgets.period_start
      group by budgets.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', budgets.id,
      'department_id', budgets.department_id,
      'department_name', budgets.department_name,
      'interval', budgets.interval,
      'limit_nanos', budgets.limit_nanos,
      'usage_nanos', usage.usage_nanos,
      'window_start', budgets.period_start,
      'reset_at', budgets.reset_at,
      'key_ids', coalesce((
        select jsonb_agg(department_keys.key_id order by department_keys.key_id)
        from department_keys
        where department_keys.department_id = budgets.department_id
      ), '[]'::jsonb)
    ) order by budgets.department_id, budgets.interval), '[]'::jsonb)
    into v_departments
    from budgets
    join usage on usage.id = budgets.id;
  end if;

  -- Blocking spend guardrails: one entry per counter (private.spend_guardrail_usage), counted
  -- like a department budget over its keys, with the same exclusions.
  if exists (
    select 1 from public.workspace_guardrails g
    where g.workspace_id = p_workspace_id and g.kind = 'spend' and g.enabled and g.spend_action = 'block'
  ) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'guardrail_id', u.guardrail_id,
      'guardrail_name', u.guardrail_name,
      'counting', u.spend_counting,
      'counter', u.counter,
      'interval', u.spend_period,
      'limit_nanos', u.limit_nanos,
      'usage_nanos', u.usage_nanos,
      'window_start', u.period_start,
      'reset_at', u.reset_at,
      'key_ids', to_jsonb(u.key_ids)
    ) order by u.guardrail_name, u.guardrail_id, u.counter), '[]'::jsonb)
    into v_guardrails
    from private.spend_guardrail_usage(p_workspace_id, now(), v_exclude, 'block') u;
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
    'department_budgets', v_departments,
    'guardrail_budgets', v_guardrails
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) IS 'Seeds the gateway spend-limit coordinator: per-key day/week/month usage with the request-context windows and filters (excluding already-recorded request ids), plus workspace budget status, department budgets and blocking spend guardrail counters with their usage and keys.';

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM PUBLIC, "anon", "authenticated";

-- ---- 4. alerts
CREATE OR REPLACE FUNCTION public.sweep_spend_guardrail_alerts (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Sends a money push to owners and admins once per spend guardrail counter, period and limit
-- value when the counter reaches 80% of the guardrail's limit (spend_guardrail_warning), and again
-- when it reaches 100% (spend_guardrail_reached). Counters are private.spend_guardrail_usage's:
-- one per assignment for a shared guardrail, one per key for an each_key guardrail. A blocking
-- guardrail is enforced by the gateway's spend-limit coordinator at 100% (batch, realtime and
-- OAuth requests excepted) without a push, so the 100% push comes from this sweep. No warning is
-- sent once the limit is reached. A limit changed mid-period can alert again. Only workspaces
-- with an enabled spend guardrail are read.
declare
  v_workspaces integer := 0;
  v_alerted integer := 0;
  v_count integer;
  v_workspace uuid;
begin
  if p_now is null then
    raise exception 'invalid_spend_guardrail_sweep_time';
  end if;

  for v_workspace in
    select distinct g.workspace_id from public.workspace_guardrails g where g.kind = 'spend' and g.enabled
  loop
    v_workspaces := v_workspaces + 1;
    with due as (
      select
        u.*,
        case when u.usage_nanos >= u.limit_nanos then 'spend_guardrail_reached' else 'spend_guardrail_warning' end as kind,
        to_char(u.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || u.limit_nanos as period_key,
        case when char_length(u.guardrail_name) > 40 then left(u.guardrail_name, 39) || '…' else u.guardrail_name end as name,
        case u.spend_period when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' else ' so far this month.' end as so_far,
        case when u.spend_counting = 'each_key' then (
          select coalesce(nullif(btrim(k.name), ''), k.prefix, 'An API key') from public.keys k where k.id = u.key_ids[1]
        ) end as key_label
      from private.spend_guardrail_usage(v_workspace, p_now) u
      where u.usage_nanos >= 0.8 * u.limit_nanos
    ),
    inserted as (
      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
      select
        v_workspace,
        d.kind,
        'money',
        d.kind || ':spend_guardrail:' || d.guardrail_id || ':' || d.counter || ':' || d.spend_period || ':' || d.period_key,
        jsonb_build_object(
          'push', jsonb_build_object(
            'title', case
              when d.key_label is not null and d.kind = 'spend_guardrail_reached' then d.key_label || ' has used its ' || d.spend_period || ' limit from ' || d.name
              when d.key_label is not null then d.key_label || ' is at 80% of its ' || d.spend_period || ' limit from ' || d.name
              when d.kind = 'spend_guardrail_reached' then d.name || ' has used its ' || d.spend_period || ' spend limit'
              else d.name || ' is at 80% of its ' || d.spend_period || ' spend limit' end,
            'body', private.spend_limit_amount('cost', d.usage_nanos) || ' of ' || private.spend_limit_amount('cost', d.limit_nanos)
              || d.so_far
              || case when d.kind = 'spend_guardrail_reached' and d.spend_action = 'block'
                then ' Requests it covers are now refused until the limit resets (batch jobs, realtime sessions and OAuth requests excepted).'
                else '' end,
            'href', '/settings/guardrails'
          ),
          'guardrailId', d.guardrail_id, 'counter', d.counter, 'window', d.spend_period, 'metric', 'cost',
          'action', d.spend_action, 'limit', d.limit_nanos, 'used', d.usage_nanos, 'periodStart', d.period_start, 'resetAt', d.reset_at
        ),
        p_now
      from due d
      where d.kind = 'spend_guardrail_reached'
        or not exists (
          select 1 from public.workspace_notification_events e
          where e.dedupe_key = 'spend_guardrail_reached:spend_guardrail:' || d.guardrail_id || ':' || d.counter || ':' || d.spend_period || ':' || d.period_key
        )
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_count from inserted;
    v_alerted := v_alerted + v_count;
  end loop;

  return jsonb_build_object('workspaces', v_workspaces, 'alerted', v_alerted);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_guardrail_alerts"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
