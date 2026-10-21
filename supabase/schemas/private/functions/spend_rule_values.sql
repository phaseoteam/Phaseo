CREATE OR REPLACE FUNCTION private.spend_rule_values (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_rule_id      uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id                     uuid,
    name                   text,
    metric                 text,
    action                 text,
    scope_type             text,
    scope_id               text,
    scope_key_id           uuid,
    scope_user_id          uuid,
    scope_department_id    uuid,
    period                 text,
    base_kind              text,
    base_ref               text,
    base_amount_nanos      bigint,
    threshold_percents     integer[],
    threshold_amount_nanos bigint,
    time_zone              text,
    period_start           timestamp with time zone,
    period_end             timestamp with time zone,
    value_nanos            numeric,
    base_nanos             bigint,
    window_hours           integer,
    cooldown_minutes       integer,
    previous_start         timestamp with time zone,
    previous_end           timestamp with time zone,
    forecast_from          timestamp with time zone,
    projected_nanos        numeric,
    limit_nanos            bigint,
    reaches_at             timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The current value and base of spend rules at p_now: the one definition of "spend so far"
  -- that the evaluator (private.evaluate_workspace_spend_rules), the API preview
  -- (public.preview_workspace_spend_rule) and test sends share.
  --   * Without p_rule_id: the workspace's enabled, non-deleted rules that
  --     private.spend_rule_evaluable accepts (what the evaluator fires on), except balance rules
  --     (private.spend_balance_rule_values).
  --   * With p_rule_id: that rule if it is not deleted, enabled or not: a calendar rule of any
  --     metric, or a rolling spend or budget_percent rule. Other rolling rules have no row.
  --   * Window: a calendar rule's day, Monday week or month in its zone
  --     (private.spend_rule_period); a rolling rule's last window_hours, as period_start = p_now
  --     - window_hours and period_end = p_now.
  --   * Zone: the rule's time_zone, else the workspace's billing_time_zone, else UTC.
  --   * Spend: v2_private_usage_15m buckets starting in the window up to p_now, plus successful
  --     async jobs and realtime sessions from gateway_requests (as sweep_spend_limit_warnings
  --     adds them). The rollup is read as it stands. Usage is read once per workspace and split
  --     at each distinct window boundary, so every rule sums a handful of rows.
  --   * Scopes: workspace; key (key_id); member (actor_user_id: their keys and OAuth requests);
  --     department (private.spend_scope_departments, read now); model (model_id); provider (the
  --     route's provider_slug, or gateway_requests.provider for async jobs).
  --   * Bases: amount (base_amount_nanos), workspace_budget (the workspace_budgets row for
  --     base_ref), key_limit (the key's *_limit_cost_nanos, 0 = none), previous_period (spend in
  --     [previous_start, previous_end), null when there was none). The previous period follows the
  --     usage dashboard's calendar comparisons: a period so far is compared with the same point in
  --     the one before (today until 09:12 with yesterday until 09:12, 31 March with 28 February,
  --     on the local wall clock), a rolling window with the same length immediately before it, and
  --     a forecast (a whole period, projected) with the whole period before.
  --   * Forecast (metric forecast): the usage dashboard's straight-line projection, as the key
  --     limit forecast computes it: projected = spend so far x period length / time elapsed,
  --     from forecast_from = period_start + 3 hours (day), 24 hours (week) or 72 hours (month); null
  --     before then, 0 without spend. limit_nanos is what the forecast is measured against
  --     (threshold_amount_nanos, else the base); reaches_at is when the pace so far reaches it,
  --     only when that happens before the period ends and it has not been reached yet.
  with settings as (
    select coalesce((
      select s.billing_time_zone from public.workspace_settings s where s.workspace_id = p_workspace_id
    ), 'UTC') as time_zone
  ),
  rules as materialized (
    select
      rule.id, rule.name, rule.metric, rule.action, rule.scope_type, rule.scope_id, rule.scope_key_id, rule.scope_user_id,
      rule.scope_department_id, rule.period, rule.base_kind, rule.base_ref, rule.base_amount_nanos,
      rule.threshold_percents, rule.threshold_amount_nanos, zone.time_zone, window_bounds.period_start, window_bounds.period_end,
      rule.window_hours, rule.cooldown_minutes,
      case when rule.base_kind = 'previous_period' then
        case
          when rule.period = 'rolling' then window_bounds.period_start - make_interval(hours => rule.window_hours)
          else ((window_bounds.period_start at time zone zone.time_zone) - unit.step) at time zone zone.time_zone
        end
      end as previous_start,
      case when rule.base_kind = 'previous_period' then
        case
          when rule.period = 'rolling' or rule.metric = 'forecast' then window_bounds.period_start
          else ((p_now at time zone zone.time_zone) - unit.step) at time zone zone.time_zone
        end
      end as previous_end
    from public.workspace_spend_rules rule
    cross join settings
    cross join lateral (select coalesce(rule.time_zone, settings.time_zone) as time_zone) zone
    cross join lateral (
      select calendar.period_start, calendar.period_end
      from private.spend_rule_period(rule.period, zone.time_zone, p_now) calendar
      union all
      select p_now - make_interval(hours => rule.window_hours), p_now
      where rule.period = 'rolling' and rule.window_hours is not null
    ) window_bounds
    cross join lateral (
      select case rule.period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end as step
    ) unit
    where rule.workspace_id = p_workspace_id
      and rule.deleted_at is null
      and (rule.period <> 'rolling' or rule.metric in ('spend', 'budget_percent'))
      and case
        when p_rule_id is null then rule.enabled and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
        else rule.id = p_rule_id
      end
  ),
  starts as materialized (
    -- Every window boundary: a row of usage belongs to the segment of the latest one at or
    -- before it, and each window is a run of whole segments.
    select distinct boundary.at
    from rules
    cross join lateral (values (rules.period_start), (rules.previous_start), (rules.previous_end)) boundary(at)
    where boundary.at is not null and boundary.at < p_now
  ),
  raw as (
    select rollup.bucket_start as at, rollup.key_id, rollup.actor_user_id, rollup.model_id, rollup.provider_model_id,
      null::text as provider, rollup.cost_nanos
    from public.v2_private_usage_15m rollup
    where rollup.workspace_id = p_workspace_id
      and rollup.bucket_start >= (select min(starts.at) from starts)
      and rollup.bucket_start < p_now
    union all
    -- gateway_requests_async_spend_idx
    select request.created_at, request.key_id, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by), request.model_id,
      null, request.provider, coalesce(request.cost_nanos, 0)::numeric
    from public.gateway_requests request
    left join public.keys key on key.id = request.key_id
    where request.success is true
      and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
      and request.workspace_id = p_workspace_id
      and request.created_at >= (select min(starts.at) from starts)
      and request.created_at < p_now
  ),
  segments as materialized (
    -- Spend per segment (the latest boundary at or before the usage) and attribution.
    select segment.at as segment_start, raw.key_id, raw.actor_user_id, raw.model_id, raw.provider_model_id, raw.provider,
      sum(raw.cost_nanos) as cost_nanos
    from raw
    cross join lateral (select max(starts.at) as at from starts where starts.at <= raw.at) segment
    group by 1, 2, 3, 4, 5, 6
  ),
  usage as materialized (
    select segments.segment_start, segments.key_id, segments.actor_user_id, segments.model_id,
      coalesce(segments.provider, route.provider_slug) as provider, segments.cost_nanos
    from segments
    left join public.v2_model_provider_routes route on route.provider_model_id = segments.provider_model_id
  ),
  departments as materialized (
    select pair.key_id, pair.actor_user_id, scope.department_id
    from (select distinct usage.key_id, usage.actor_user_id from usage) pair
    cross join lateral private.spend_scope_departments(p_workspace_id, pair.key_id, pair.actor_user_id) scope(department_id)
    where exists (select 1 from rules where rules.scope_type = 'department')
  ),
  summed as (
    select rules.*,
      coalesce(sums.value_nanos, 0) as value_nanos,
      case rules.base_kind
        when 'amount' then rules.base_amount_nanos
        when 'workspace_budget' then (
          select budget.limit_nanos from public.workspace_budgets budget
          where budget.workspace_id = p_workspace_id and budget.interval = rules.base_ref
        )
        when 'key_limit' then (
          select nullif(case rules.base_ref
              when 'daily' then key.daily_limit_cost_nanos
              when 'weekly' then key.weekly_limit_cost_nanos
              when 'monthly' then key.monthly_limit_cost_nanos
            end, 0)
          from public.keys key
          where key.id = rules.scope_key_id and key.workspace_id = p_workspace_id
        )
        when 'previous_period' then nullif(round(coalesce(sums.previous_nanos, 0)), 0)::bigint
      end as base_nanos,
      -- Elapsed time and length in milliseconds, as the dashboard's helpers count them.
      (extract(epoch from p_now) - extract(epoch from rules.period_start)) * 1000 as elapsed_ms,
      (extract(epoch from rules.period_end) - extract(epoch from rules.period_start)) * 1000 as length_ms,
      case when rules.metric = 'forecast' then
        rules.period_start + case rules.period when 'day' then interval '3 hours' when 'week' then interval '24 hours' else interval '72 hours' end
      end as forecast_from
    from rules
    cross join lateral (
      select
        sum(usage.cost_nanos) filter (where usage.segment_start >= rules.period_start) as value_nanos,
        sum(usage.cost_nanos) filter (where usage.segment_start >= rules.previous_start and usage.segment_start < rules.previous_end) as previous_nanos
      from usage
      where usage.segment_start >= least(rules.period_start, coalesce(rules.previous_start, rules.period_start))
        and case rules.scope_type
          when 'workspace' then true
          when 'key' then usage.key_id = rules.scope_key_id
          when 'member' then usage.actor_user_id = rules.scope_user_id
          when 'model' then usage.model_id = rules.scope_id
          when 'provider' then usage.provider = rules.scope_id
          when 'department' then exists (
            select 1 from departments
            where departments.department_id = rules.scope_department_id
              and departments.key_id is not distinct from usage.key_id
              and departments.actor_user_id is not distinct from usage.actor_user_id
          )
          else false
        end
    ) sums
  ),
  projected as (
    select summed.*,
      case
        when summed.metric <> 'forecast' or p_now < summed.forecast_from then null
        when summed.value_nanos <= 0 then 0::numeric
        else summed.value_nanos * summed.length_ms / summed.elapsed_ms
      end as projected_nanos,
      case when summed.metric = 'forecast' then coalesce(summed.threshold_amount_nanos, summed.base_nanos) end as limit_nanos
    from summed
  )
  select projected.id, projected.name, projected.metric, projected.action, projected.scope_type, projected.scope_id,
    projected.scope_key_id, projected.scope_user_id, projected.scope_department_id, projected.period, projected.base_kind,
    projected.base_ref, projected.base_amount_nanos, projected.threshold_percents, projected.threshold_amount_nanos,
    projected.time_zone, projected.period_start, projected.period_end, projected.value_nanos, projected.base_nanos,
    projected.window_hours, projected.cooldown_minutes, projected.previous_start, projected.previous_end,
    projected.forecast_from, round(projected.projected_nanos), projected.limit_nanos,
    -- Reaching the limit exactly as the period ends is not a hit: the reset comes first.
    case when projected.limit_nanos > 0 and projected.value_nanos > 0 and projected.value_nanos < projected.limit_nanos
        and projected.projected_nanos > projected.limit_nanos
      then projected.period_start
        + (round(projected.elapsed_ms * projected.limit_nanos / projected.value_nanos) / 1000)::double precision * interval '1 second'
    end
  from projected;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) IS 'Spend so far (value_nanos), the percentage base (base_nanos, including the previous period''s spend) and, for forecast rules, the straight-line projection to the period end with the time the pace reaches the limit, for spend rules over their calendar period or rolling window at p_now. Without p_rule_id: the enabled rules the evaluator handles (balance rules aside); with it: that non-deleted rule. Shared by the evaluator, the API preview and test sends.';

REVOKE ALL ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) TO "service_role";
