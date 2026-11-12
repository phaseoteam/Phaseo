-- phaseo:allow-destructive-migration reason: drops and re-creates private.spend_rule_values (new result columns) and private.spend_rule_alert_text (new arguments), which CREATE OR REPLACE cannot change in place. Both are pure read functions re-created in the same transaction; no data is deleted by this migration.

-- Spend rules forecast (PR 10 of the spend rules stack): forecast rules, previous-period bases and
-- rolling windows for spend and budget_percent rules.
-- * private.spend_rule_evaluable: forecast (calendar), previous_period bases, and rolling spend /
--   budget_percent rules (amount or previous-window base) are evaluated.
-- * private.spend_rule_values: rolling windows (p_now - window_hours), the previous-period base
--   (the usage dashboard's calendar comparison: the same point in the previous period, the window
--   before, or the whole previous period for a forecast), and the forecast: the dashboard's
--   straight-line projection to the period end, ready 3/24/72 hours into a day/week/month, with
--   the time the pace reaches the limit.
-- * private.spend_rule_alert_text: forecast, rolling and previous-period wording.
-- * private.evaluate_workspace_spend_rules: forecast thresholds once per period; rolling rules
--   fire with cooldown_minutes (state row '-infinity'); rolling block rules have no reset and
--   lift below the limit.
-- * public.preview_workspace_spend_rule: the projection, its date and the previous period.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.spend_rule_evaluable (
  p_metric    text,
  p_period    text,
  p_base_kind text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Which spend rules private.evaluate_workspace_spend_rules handles so far:
  --   * spend, budget_percent and forecast over a calendar day, week or month, with an amount,
  --     workspace budget, key limit or previous-period base;
  --   * spend and budget_percent over a rolling window (window_hours), with an amount or
  --     previous-window base (cooldown_minutes between alerts);
  --   * balance rules (workspace scope, rolling: window_hours is the burn-rate lookback).
  -- Spike rules are added by a later change, which widens this test so that the sweep's passes
  -- and the evaluator stay in step.
  select (p_metric in ('spend', 'budget_percent', 'forecast')
      and p_period in ('day', 'week', 'month')
      and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit', 'previous_period')))
    or (p_metric in ('spend', 'budget_percent') and p_period = 'rolling' and (p_base_kind is null or p_base_kind in ('amount', 'previous_period')))
    or (p_metric in ('balance') and p_period = 'rolling' and p_base_kind is null);
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend, budget_percent and forecast over a calendar day, week or month (amount, workspace_budget, key_limit or previous_period base), spend and budget_percent over a rolling window (amount or previous_period base), and balance rules (rolling burn-rate window).';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";

DROP FUNCTION IF EXISTS "private"."spend_rule_values"(uuid, timestamp with time zone, uuid);

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

DROP FUNCTION IF EXISTS "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer);

CREATE OR REPLACE FUNCTION private.spend_rule_alert_text (
  p_workspace_name         text,
  p_rule_name              text,
  p_metric                 text,
  p_scope_type             text,
  p_scope_id               text,
  p_scope_key_id           uuid,
  p_scope_user_id          uuid,
  p_scope_department_id    uuid,
  p_period                 text,
  p_period_end             timestamp with time zone,
  p_time_zone              text,
  p_base_kind              text,
  p_base_ref               text,
  p_base_nanos             bigint,
  p_threshold_percents     integer[],
  p_threshold_amount_nanos bigint,
  p_value_nanos            numeric,
  p_threshold_percent      integer,
  p_window_hours           integer,
  p_projected_nanos        numeric,
  p_reaches_at             timestamp with time zone
)
  RETURNS TABLE (
    scope_label text,
    title       text,
    message     text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The text of a spend alert (spend, budget_percent and forecast rules over a calendar period or
  -- a rolling window): the scope's label, the title and the message, in US money format with
  -- times in the rule's zone. Used by private.evaluate_workspace_spend_rules for real alerts and
  -- by public.preview_workspace_spend_rule for previews and test sends, so both read the same.
  --   p_threshold_percent: the threshold the alert names (budget_percent, forecast by percent).
  --   p_window_hours: a rolling rule's window.
  --   p_projected_nanos / p_reaches_at: a forecast's projected period total, and when the pace
  --   so far reaches the limit (the amount threshold, else the base), if it does this period.
  with label as (
    select case p_scope_type
      when 'workspace' then nullif(btrim(p_workspace_name), '')
      when 'key' then (select nullif(btrim(key.name), '') from public.keys key where key.id = p_scope_key_id)
      when 'member' then (select nullif(btrim(member.email), '') from auth.users member where member.id = p_scope_user_id)
      when 'department' then (
        select nullif(btrim(department.name), '') from public.workspace_departments department
        where department.id = p_scope_department_id
      )
      when 'model' then (select nullif(btrim(model.name), '') from public.v2_models model where model.model_slug = p_scope_id limit 1)
    end as label
  ),
  parts as (
    select
      coalesce(label.label, p_scope_id, p_workspace_name, 'Workspace') as scope_label,
      case p_scope_type
        when 'workspace' then 'The workspace'
        when 'key' then 'API key ''' || coalesce(left(label.label, 60), 'deleted key') || ''''
        when 'member' then coalesce(label.label, 'A former member')
        when 'department' then 'Department ''' || coalesce(left(label.label, 60), 'deleted department') || ''''
        when 'model' then coalesce(label.label, p_scope_id)
        else 'Provider ' || p_scope_id
      end as subject,
      case p_base_kind
        when 'workspace_budget' then 'the ' || p_base_ref || ' budget'
        when 'key_limit' then 'the key''s ' || p_base_ref || ' limit'
        when 'previous_period' then case
          when p_period = 'rolling' then 'the ' || case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end || ' before'
          when p_metric = 'forecast' then case p_period when 'day' then 'yesterday''s total' else 'last ' || p_period || '''s total' end
          else case p_period when 'day' then 'yesterday at this time' else 'the same point last ' || p_period end
        end
        else private.workspace_push_usd(p_base_nanos)
      end as base_short,
      case p_period
        when 'day' then 'today'
        when 'week' then 'this week'
        when 'month' then 'this month'
        else 'in the last ' || case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end
      end as so_far,
      case when p_period = 'rolling' then ''
        else ' The ' || p_period || ' resets ' || to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone || '.'
      end as resets,
      to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone as period_end_text,
      to_char(p_reaches_at at time zone p_time_zone, 'Mon FMDD, HH24:MI') as reaches_text
    from label
  ),
  texts as (
    select parts.*,
      case p_base_kind
        when 'amount' then private.workspace_push_usd(p_base_nanos)
        else parts.base_short || ' (' || private.workspace_push_usd(p_base_nanos) || ')'
      end as base_long,
      'Alerts at ' || (select string_agg(threshold || '%', ', ' order by threshold) from unnest(p_threshold_percents) threshold) || '.' as alerts_at,
      -- The forecast's limit: the amount threshold, else the base.
      case when p_threshold_amount_nanos is not null then private.workspace_push_usd(p_threshold_amount_nanos) end as limit_amount
    from parts
  )
  select
    texts.scope_label,
    left(p_rule_name, 100) || ': ' || case
        when p_metric = 'spend' then private.workspace_push_usd(p_threshold_amount_nanos) || ' reached'
        when p_metric = 'forecast' and p_threshold_amount_nanos is not null
          then 'projected to reach ' || private.workspace_push_usd(p_projected_nanos) || ' ' || texts.so_far
        when p_metric = 'forecast' then 'projected to pass ' || p_threshold_percent || '% of ' || texts.base_short
        else p_threshold_percent || '% of ' || texts.base_short || ' reached'
      end,
    case
      when p_metric = 'forecast' then
        texts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || texts.so_far
          || ' and is projected to reach ' || private.workspace_push_usd(p_projected_nanos) || ' by ' || texts.period_end_text
          || case
            when p_threshold_amount_nanos is not null then ', past the ' || texts.limit_amount || ' alert threshold.'
            else ': ' || to_char(floor(p_projected_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of ' || texts.base_long || '. ' || texts.alerts_at
          end
          || case
            when p_reaches_at is not null then ' At this pace it reaches '
              || coalesce(texts.limit_amount, texts.base_long) || ' on ' || texts.reaches_text || '.'
            when p_value_nanos >= coalesce(p_threshold_amount_nanos, p_base_nanos) then ' It has already passed '
              || coalesce(texts.limit_amount, texts.base_long) || '.'
            else ''
          end
      else
        texts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || texts.so_far
          || case when p_metric = 'spend'
            then ', past the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold.'
            else ': ' || to_char(floor(p_value_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of ' || texts.base_long || '. ' || texts.alerts_at
          end
          || texts.resets
    end
  from texts;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) IS 'Scope label, title and message of a spend alert for a spend, budget_percent or forecast rule over a calendar period or rolling window. Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer, integer, numeric, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION private.evaluate_workspace_spend_rules (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_blocks       boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates a workspace's enabled spend rules at p_now, queues an alert for each rule that
-- crossed a threshold, and starts or lifts the blocks of rules with action = 'block'.
--   * Rules: private.spend_rule_evaluable (spend, budget_percent and forecast over a calendar day,
--     Monday week or month; spend and budget_percent over a rolling window; balance rules);
--     spike is left for later. Each calendar rule's period is in its own time zone, or the
--     workspace's billing_time_zone (private.spend_rule_period).
--   * Spend: v2_private_usage_15m from the period (or window) start up to p_now, plus successful async jobs
--     and realtime sessions from gateway_requests (as sweep_spend_limit_warnings adds them).
--     The rollup is read as it stands: hours the outbox has yet to rebuild count once it marks
--     the workspace dirty again. Values come from private.spend_rule_values and the text from
--     private.spend_rule_alert_text, which the API preview and test sends share.
--   * Scopes: workspace; key (key_id); member (actor_user_id: their keys and OAuth requests);
--     department (private.spend_scope_departments, read now, so moving someone moves their
--     spend for the current period); model (model_id); provider (the route's provider_slug,
--     or gateway_requests.provider for async jobs).
--   * Bases for budget_percent and forecast: amount (base_amount_nanos), workspace_budget (the
--     workspace_budgets row for base_ref), key_limit (the key's *_limit_cost_nanos) and
--     previous_period (spend at the same point in the previous period, the window before a
--     rolling one, or the whole previous period for a forecast). A rule whose base is missing
--     or 0 does not fire.
--   * Forecast: projected period-end spend (private.spend_rule_values: the usage dashboard's
--     straight line from the period start, ready 3 hours into a day, 24 into a week and 72 into
--     a month) against threshold_amount_nanos or threshold_percents of the base. It fires only
--     once the projection is ready and at least a cent has been spent this period.
--   * Firing: each threshold at most once per period. Several crossed at once make one event
--     naming the highest. A spend rule fires once per period at threshold_amount_nanos.
--     Rolling rules use cooldown_minutes instead (state row period_start '-infinity'): while
--     over a threshold they fire again once the cooldown since the last alert ends, and within
--     it only for a higher threshold.
--   * Each event is an email_outbox row of kind spend_alert, deduped by
--     spend_alert:<rule id>:<period start, UTC ISO>:<threshold percent, amount-<nanos>,
--     projected-<percent> or projected-amount-<nanos>> (rolling rules:
--     spend_alert:<rule id>:cooldown:<epoch / cooldown>:<threshold>), with
--     its text in payload.title / payload.message and a payload.push for the mobile app. The
--     routed delivery job sends it to the rule's destinations, or else the workspace's
--     spend_alert routes; mobile push picks it up as a money push.
--   * workspace_spend_rule_state is written only when a rule fires, or for the first evaluation
--     in a period (the rollover row), never on a quiet re-evaluation.
--   * Blocks (grace margin): a block rule's block point is block_at_amount_nanos (spend rules) or
--     block_at_percent of the base (budget_percent rules). Once spend this period reaches it, a
--     workspace_spend_blocks row starts, unless the rule already has an active block or an
--     admin lifted one manually this period (a manual lift holds until the period resets, or
--     for one window of a rolling rule). A rolling rule's block has no reset (resets_at null)
--     and lifts once spend over the window is below the block point.
--     Blocks start only when p_blocks is true (SPEND_RULE_BLOCKS_ENABLED) and p_now is within
--     15 minutes of the database clock, so a late or replayed evaluation never starts one; a
--     failed evaluation rolls back. Active blocks are lifted, whatever p_blocks says, when the
--     period resets (period_reset), spend is below the block point again, for example because
--     the budget was raised (below_limit, or rule_changed when the rule was edited since the
--     block started), or the rule was deleted, disabled or no longer blocks (rule_deleted,
--     rule_disabled, rule_changed; the rule-change trigger usually lifts these first). An active
--     block whose rule stopped or started covering free models takes the rule's setting.
--     Each start and lift queues a spend_blocked event (private.queue_spend_block_event).
--   * Balance rules (workspace scope, rolling): values from private.spend_balance_rule_values
--     (available balance = balance - reserved, as the gateway admits requests; burn over
--     window_hours from the rollup plus async jobs; runway = available / burn per day). A rule is
--     low when the balance is at or below threshold_amount_nanos or the runway at or below
--     runway_days. Armed/unarmed, as the low-balance push and email: one state row
--     (period_start '-infinity'), armed until a drop. Found armed and low, that is a drop: one
--     alert, unless the last one was within cooldown_minutes (then it stays armed and fires once
--     the cooldown ends, if still low) or auto top-up is working
--     (private.workspace_auto_top_up_covers; the drop is recorded unarmed without an alert). It
--     re-arms once neither threshold holds. Dedupe:
--     spend_alert:<rule id>:cooldown:<epoch / cooldown>:<balance|runway>. The state row is written
--     only when armed changes or the rule fires.
-- Returns {rules, fired, state_rows, events: [{event_id, rule_id, dedupe_key, threshold}],
-- blocks: [{block_id, rule_id, state: started|lifted, reason, event_id}], block_scope}, where
-- block_scope says the workspace has block rules or blocks, so its gateway entry is republished.
declare
  v_workspace record;
  v_result jsonb;
  v_block_rules jsonb;
  v_block record;
  v_blocks jsonb := '[]'::jsonb;
  v_changed integer := 0;
  v_fresh boolean;
  v_balance jsonb;
begin
  if p_workspace_id is null or p_now is null then
    raise exception 'invalid_spend_rule_evaluation';
  end if;

  select w.id, w.name, w.owner_user_id, coalesce(settings.billing_time_zone, 'UTC') as time_zone, owner.email as owner_email
    into v_workspace
  from public.workspaces w
  left join public.workspace_settings settings on settings.workspace_id = w.id
  left join auth.users owner on owner.id = w.owner_user_id
  where w.id = p_workspace_id;
  if not found then
    return jsonb_build_object('rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb,
      'block_scope', false, 'missing', true);
  end if;

  with valued as materialized (
    -- Spend so far and the base of every enabled, evaluable rule (shared with the API preview).
    select * from private.spend_rule_values(p_workspace_id, p_now)
  ),
  decided as (
    -- A rolling rule's state is its '-infinity' row, and what it fired counts only within
    -- cooldown_minutes of the last alert: within it only a higher threshold fires, after it the
    -- rule fires again while it is still over.
    select valued.*, valued.period = 'rolling' as rolling, state.rule_id is not null as has_state,
      case when valued.period <> 'rolling' or cooling.active then state.highest_percent_fired end as highest_percent_fired,
      case when valued.period <> 'rolling' or cooling.active then state.amount_fired_at end as amount_fired_at,
      crossed.highest as crossed_percent,
      -- A forecast fires only once the projection is ready and at least a cent has been spent.
      valued.metric = 'forecast' and valued.projected_nanos is not null and valued.value_nanos >= 10000000 as forecast_ready
    from valued
    left join public.workspace_spend_rule_state state
      on state.rule_id = valued.id
      and state.period_start = case when valued.period = 'rolling' then '-infinity'::timestamptz else valued.period_start end
    cross join lateral (
      select coalesce(state.last_fired_at > p_now - make_interval(mins => valued.cooldown_minutes), false) as active
    ) cooling
    cross join lateral (
      select max(threshold) as highest
      from unnest(valued.threshold_percents) threshold
      where valued.base_nanos > 0
        and case valued.metric
          when 'budget_percent' then valued.value_nanos * 100 >= threshold::numeric * valued.base_nanos
          when 'forecast' then valued.projected_nanos is not null and valued.value_nanos >= 10000000
            and valued.projected_nanos * 100 >= threshold::numeric * valued.base_nanos
          else false
        end
    ) crossed
  ),
  firing as (
    select decided.*,
      case
        when decided.metric = 'spend' then 'amount-' || decided.threshold_amount_nanos
        when decided.metric = 'forecast' and decided.threshold_amount_nanos is not null then 'projected-amount-' || decided.threshold_amount_nanos
        when decided.metric = 'forecast' then 'projected-' || decided.crossed_percent
        else decided.crossed_percent::text
      end as threshold_key,
      case
        when decided.rolling then 'cooldown:' || floor(extract(epoch from p_now) / (decided.cooldown_minutes * 60))::bigint
        else to_char(decided.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      end as period_key
    from decided
    where (decided.metric = 'spend' and decided.amount_fired_at is null and decided.value_nanos >= decided.threshold_amount_nanos)
      or (decided.metric in ('budget_percent', 'forecast') and decided.crossed_percent > coalesce(decided.highest_percent_fired, 0))
      or (decided.metric = 'forecast' and decided.threshold_amount_nanos is not null and decided.amount_fired_at is null
        and decided.forecast_ready and decided.projected_nanos >= decided.threshold_amount_nanos)
  ),
  rendered as (
    select firing.*, alert.scope_label, alert.title, alert.message,
      'spend_alert:' || firing.id || ':' || firing.period_key || ':' || firing.threshold_key as dedupe_key
    from firing
    cross join lateral private.spend_rule_alert_text(
      v_workspace.name, firing.name, firing.metric, firing.scope_type, firing.scope_id, firing.scope_key_id,
      firing.scope_user_id, firing.scope_department_id, firing.period, firing.period_end, firing.time_zone,
      firing.base_kind, firing.base_ref, firing.base_nanos, firing.threshold_percents, firing.threshold_amount_nanos,
      firing.value_nanos, firing.crossed_percent, firing.window_hours, firing.projected_nanos, firing.reaches_at
    ) alert
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    select
      'spend_alert',
      'spend_alert',
      coalesce(v_workspace.owner_email, ''),
      rendered.title,
      p_workspace_id,
      v_workspace.owner_user_id,
      jsonb_build_object(
        'title', rendered.title,
        'message', rendered.message,
        'workspace_name', v_workspace.name,
        'rule_id', rendered.id,
        'rule_name', rendered.name,
        'metric', rendered.metric,
        'action', rendered.action,
        'scope', jsonb_strip_nulls(jsonb_build_object(
          'type', rendered.scope_type,
          'id', rendered.scope_id,
          'label', rendered.scope_label,
          'key_id', rendered.scope_key_id,
          'user_id', rendered.scope_user_id,
          'department_id', rendered.scope_department_id
        )),
        'period', jsonb_strip_nulls(jsonb_build_object(
          'kind', rendered.period,
          'start', rendered.period_start,
          'end', rendered.period_end,
          'time_zone', rendered.time_zone,
          'window_hours', rendered.window_hours
        )),
        'value_nanos', rendered.value_nanos,
        'base_kind', rendered.base_kind,
        'base_ref', rendered.base_ref,
        'base_nanos', rendered.base_nanos,
        'previous_period', case when rendered.previous_start is not null then jsonb_build_object(
          'start', rendered.previous_start, 'end', rendered.previous_end) end,
        'percent', case when rendered.base_nanos > 0 then round(rendered.value_nanos * 100 / rendered.base_nanos, 1) end,
        'threshold_percent', rendered.crossed_percent,
        'threshold_percents', to_jsonb(rendered.threshold_percents),
        'thresholds_crossed', case when rendered.metric in ('budget_percent', 'forecast') and rendered.crossed_percent is not null then (
          select coalesce(jsonb_agg(threshold order by threshold), '[]'::jsonb)
          from unnest(rendered.threshold_percents) threshold
          where threshold <= rendered.crossed_percent and threshold > coalesce(rendered.highest_percent_fired, 0)
        ) end,
        'threshold_amount_nanos', rendered.threshold_amount_nanos,
        'forecast', case when rendered.metric = 'forecast' then jsonb_build_object(
          'projected_nanos', rendered.projected_nanos,
          'projected_percent', case when rendered.base_nanos > 0 then round(rendered.projected_nanos * 100 / rendered.base_nanos, 1) end,
          'by', rendered.period_end,
          'limit_nanos', rendered.limit_nanos,
          'reaches_at', rendered.reaches_at,
          'from', rendered.forecast_from
        ) end,
        'cooldown_minutes', case when rendered.rolling then rendered.cooldown_minutes end,
        'evaluated_at', p_now,
        'url', 'https://phaseo.app/settings/notifications',
        'push', jsonb_build_object(
          'title', left(rendered.title, 120),
          'body', left(rendered.message, 240),
          'href', '/settings/notifications',
          'lowerLead', false
        )
      ),
      rendered.dedupe_key
    from rendered
    on conflict (dedupe_key) do nothing
    returning id, dedupe_key, payload
  ),
  saved as (
    -- A fired rule records what it sent; a calendar rule seen for the first time this period
    -- gets its rollover row. Rules already recorded this period that fire nothing are not
    -- written. A rolling rule has one '-infinity' row, written only when it fires, which then
    -- holds what this alert named (the cooldown starts again).
    insert into public.workspace_spend_rule_state as state (
      rule_id, workspace_id, period_start, period_end, highest_percent_fired, amount_fired_at, last_fired_at,
      fire_count, last_value_nanos, last_base_nanos, last_dedupe_key
    )
    select
      decided.id, p_workspace_id,
      case when decided.rolling then '-infinity'::timestamptz else decided.period_start end,
      case when decided.rolling then null else decided.period_end end,
      case when rendered.id is not null then rendered.crossed_percent end,
      case when rendered.id is not null and decided.threshold_amount_nanos is not null and decided.metric in ('spend', 'forecast') then p_now end,
      case when rendered.id is not null then p_now end,
      case when rendered.id is not null then 1 else 0 end,
      case when rendered.id is not null then round(decided.value_nanos)::bigint end,
      case when rendered.id is not null then decided.base_nanos end,
      rendered.dedupe_key
    from decided
    left join rendered on rendered.id = decided.id
    where rendered.id is not null or not (decided.has_state or decided.rolling)
    on conflict (rule_id, period_start) do update set
      -- A rolling rule fires within its cooldown only past what it last named, so the new
      -- values are the ones to keep.
      highest_percent_fired = case when state.period_start = '-infinity'::timestamptz then excluded.highest_percent_fired
        else greatest(state.highest_percent_fired, excluded.highest_percent_fired) end,
      amount_fired_at = case when state.period_start = '-infinity'::timestamptz
        then coalesce(excluded.amount_fired_at, state.amount_fired_at)
        else coalesce(state.amount_fired_at, excluded.amount_fired_at) end,
      last_fired_at = coalesce(excluded.last_fired_at, state.last_fired_at),
      fire_count = state.fire_count + excluded.fire_count,
      last_value_nanos = coalesce(excluded.last_value_nanos, state.last_value_nanos),
      last_base_nanos = coalesce(excluded.last_base_nanos, state.last_base_nanos),
      last_dedupe_key = coalesce(excluded.last_dedupe_key, state.last_dedupe_key)
    returning 1
  )
  select jsonb_build_object(
    'rules', (select count(*) from valued),
    'fired', (select count(*) from queued),
    'state_rows', (select count(*) from saved),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', queued.id,
        'rule_id', queued.payload ->> 'rule_id',
        'dedupe_key', queued.dedupe_key,
        'threshold', coalesce(nullif(queued.payload -> 'threshold_percent', 'null'::jsonb), queued.payload -> 'threshold_amount_nanos')
      ) order by queued.dedupe_key)
      from queued
    ), '[]'::jsonb),
    -- The block point and spend of each block rule, for the block statements below.
    'block_rules', coalesce((
      -- A rolling rule's block covers the window it started in and has no reset: it lifts once
      -- spend over the window is below the block point again.
      select jsonb_agg(jsonb_build_object(
        'rule_id', valued.id,
        'rolling', valued.period = 'rolling',
        'window_hours', valued.window_hours,
        'period_start', valued.period_start,
        'period_end', case when valued.period <> 'rolling' then valued.period_end end,
        'value_nanos', valued.value_nanos,
        'limit_nanos', case valued.metric
          when 'spend' then rule.block_at_amount_nanos
          when 'budget_percent' then case when valued.base_nanos > 0
            then ceil(rule.block_at_percent::numeric * valued.base_nanos / 100)::bigint end
        end,
        'scope_type', valued.scope_type,
        'scope_id', valued.scope_id,
        'block_free_models', rule.block_free_models
      ))
      from valued
      join public.workspace_spend_rules rule on rule.id = valued.id
      where valued.action = 'block'
    ), '[]'::jsonb)
  ) into v_result;

  -- Balance rules: armed until the balance (or runway) drops to the threshold, then one alert.
  with balance as materialized (
    select * from private.spend_balance_rule_values(p_workspace_id, p_now)
  ),
  decided as (
    select balance.*, coalesce(state.armed, true) as armed,
      balance.low_balance or balance.low_runway as low,
      state.last_fired_at is not null and state.last_fired_at > p_now - make_interval(mins => balance.cooldown_minutes) as cooling,
      case when balance.low_balance then 'balance' else 'runway' end as trigger
    from balance
    left join public.workspace_spend_rule_state state
      on state.rule_id = balance.id and state.period_start = '-infinity'::timestamptz
  ),
  acted as materialized (
    select decided.*,
      case
        when decided.armed and decided.low and decided.cooling then 'waiting'
        when decided.armed and decided.low and private.workspace_auto_top_up_covers(p_workspace_id) then 'covered'
        when decided.armed and decided.low then 'fire'
        when not decided.armed and not decided.low then 'rearm'
        else 'idle'
      end as outcome
    from decided
  ),
  rendered as (
    select acted.*, alert.title, alert.message,
      'spend_alert:' || acted.id || ':cooldown:' || floor(extract(epoch from p_now) / (acted.cooldown_minutes * 60))::bigint
        || ':' || acted.trigger as dedupe_key
    from acted
    cross join lateral private.spend_balance_alert_text(
      acted.name, acted.available_nanos, acted.threshold_amount_nanos, acted.runway_days, acted.burn_per_day_nanos,
      acted.runway_days_left, acted.window_hours, acted.trigger
    ) alert
    where acted.outcome = 'fire'
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    select
      'spend_alert',
      'spend_alert',
      coalesce(v_workspace.owner_email, ''),
      rendered.title,
      p_workspace_id,
      v_workspace.owner_user_id,
      jsonb_build_object(
        'title', rendered.title,
        'message', rendered.message,
        'workspace_name', v_workspace.name,
        'rule_id', rendered.id,
        'rule_name', rendered.name,
        'metric', 'balance',
        'action', rendered.action,
        'scope', jsonb_build_object('type', 'workspace', 'label', coalesce(nullif(btrim(v_workspace.name), ''), 'Workspace')),
        'period', jsonb_build_object(
          'kind', 'rolling',
          'start', p_now - make_interval(hours => rendered.window_hours),
          'end', p_now,
          'time_zone', v_workspace.time_zone,
          'window_hours', rendered.window_hours
        ),
        'trigger', rendered.trigger,
        'value_nanos', rendered.available_nanos,
        'balance_nanos', rendered.balance_nanos,
        'reserved_nanos', rendered.reserved_nanos,
        'available_nanos', rendered.available_nanos,
        'burn_nanos', round(rendered.burn_nanos),
        'burn_per_day_nanos', round(rendered.burn_per_day_nanos),
        'runway_days_left', rendered.runway_days_left,
        'runway_days', rendered.runway_days,
        'threshold_amount_nanos', rendered.threshold_amount_nanos,
        'evaluated_at', p_now,
        'url', 'https://phaseo.app/settings/credits',
        'push', jsonb_build_object(
          'title', left(rendered.title, 120),
          'body', left(rendered.message, 240),
          'href', '/settings/credits',
          'lowerLead', false
        )
      ),
      rendered.dedupe_key
    from rendered
    on conflict (dedupe_key) do nothing
    returning id, dedupe_key, payload
  ),
  saved as (
    -- A drop (fired or covered by auto top-up) clears armed, a recovery sets it. A waiting or
    -- unchanged rule is not written.
    insert into public.workspace_spend_rule_state as state (
      rule_id, workspace_id, period_start, period_end, armed, amount_fired_at, last_fired_at, fire_count, last_value_nanos, last_dedupe_key
    )
    select acted.id, p_workspace_id, '-infinity'::timestamptz, null, acted.outcome = 'rearm',
      case when rendered.id is not null and acted.trigger = 'balance' then p_now end,
      case when rendered.id is not null then p_now end,
      case when rendered.id is not null then 1 else 0 end,
      case when rendered.id is not null then acted.available_nanos end,
      rendered.dedupe_key
    from acted
    left join rendered on rendered.id = acted.id
    where acted.outcome in ('fire', 'covered', 'rearm')
    on conflict (rule_id, period_start) do update set
      armed = excluded.armed,
      amount_fired_at = coalesce(excluded.amount_fired_at, state.amount_fired_at),
      last_fired_at = coalesce(excluded.last_fired_at, state.last_fired_at),
      fire_count = state.fire_count + excluded.fire_count,
      last_value_nanos = coalesce(excluded.last_value_nanos, state.last_value_nanos),
      last_dedupe_key = coalesce(excluded.last_dedupe_key, state.last_dedupe_key)
    returning 1
  )
  select jsonb_build_object(
    'rules', (select count(*) from balance),
    'fired', (select count(*) from queued),
    'state_rows', (select count(*) from saved),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', queued.id,
        'rule_id', queued.payload ->> 'rule_id',
        'dedupe_key', queued.dedupe_key,
        'threshold', case queued.payload ->> 'trigger'
          when 'balance' then queued.payload -> 'threshold_amount_nanos'
          else queued.payload -> 'runway_days'
        end,
        'trigger', queued.payload ->> 'trigger'
      ) order by queued.dedupe_key)
      from queued
    ), '[]'::jsonb)
  ) into v_balance;

  v_result := v_result || jsonb_build_object(
    'rules', (v_result ->> 'rules')::integer + (v_balance ->> 'rules')::integer,
    'fired', (v_result ->> 'fired')::integer + (v_balance ->> 'fired')::integer,
    'state_rows', (v_result ->> 'state_rows')::integer + (v_balance ->> 'state_rows')::integer,
    'events', (v_result -> 'events') || (v_balance -> 'events')
  );

  v_block_rules := v_result -> 'block_rules';
  v_result := v_result - 'block_rules';

  -- Lift active blocks that no longer apply. Lifts come before starts: a rule's new block cannot
  -- start while its old one is still active (one active block per rule).
  for v_block in
    with block_rule as (
      select * from jsonb_to_recordset(v_block_rules) as x(
        rule_id uuid, rolling boolean, period_start timestamptz, period_end timestamptz, value_nanos numeric, limit_nanos bigint,
        scope_type text, scope_id text, block_free_models boolean)
    ),
    decided as (
      select block.id, case
          when block.rule_id is null or rule.id is null or rule.deleted_at is not null then 'rule_deleted'
          when not rule.enabled then 'rule_disabled'
          when rule.action <> 'block' or block_rule.rule_id is null then 'rule_changed'
          when block_rule.rolling and block.resets_at is not null then 'rule_changed'
          when not block_rule.rolling and block.period_start <> block_rule.period_start then
            case when block.resets_at is not null and block.resets_at <= p_now then 'period_reset' else 'rule_changed' end
          when block.scope_type <> block_rule.scope_type or block.scope_id is distinct from block_rule.scope_id then 'rule_changed'
          when block_rule.limit_nanos is null or block_rule.value_nanos < block_rule.limit_nanos then
            case when rule.updated_at > block.started_at then 'rule_changed' else 'below_limit' end
        end as reason
      from public.workspace_spend_blocks block
      left join public.workspace_spend_rules rule on rule.id = block.rule_id
      left join block_rule on block_rule.rule_id = block.rule_id
      where block.workspace_id = p_workspace_id
        and block.lifted_at is null
    )
    update public.workspace_spend_blocks block
    set lifted_at = greatest(p_now, block.started_at), lift_reason = decided.reason
    from decided
    where block.id = decided.id
      and decided.reason is not null
    returning block.id, block.rule_id, block.lift_reason
  loop
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
      'block_id', v_block.id, 'rule_id', v_block.rule_id, 'state', 'lifted', 'reason', v_block.lift_reason,
      'event_id', private.queue_spend_block_event(v_block.id, 'lifted', p_now)));
  end loop;

  -- An active block follows its rule's free-model setting.
  with block_rule as (
    select * from jsonb_to_recordset(v_block_rules) as x(rule_id uuid, block_free_models boolean)
  )
  update public.workspace_spend_blocks block
  set block_free_models = block_rule.block_free_models
  from block_rule
  where block.rule_id = block_rule.rule_id
    and block.workspace_id = p_workspace_id
    and block.lifted_at is null
    and block.block_free_models <> block_rule.block_free_models;
  get diagnostics v_changed = row_count;

  -- Start blocks: only on a current evaluation, never for a rule lifted by hand this period.
  v_fresh := p_blocks and p_now between now() - interval '15 minutes' and now() + interval '5 minutes';
  if v_fresh then
    for v_block in
      insert into public.workspace_spend_blocks as block (
        workspace_id, rule_id, scope_type, scope_id, block_free_models, period_start, resets_at, spend_nanos, limit_nanos, started_at
      )
      select p_workspace_id, block_rule.rule_id, block_rule.scope_type, block_rule.scope_id, block_rule.block_free_models,
        block_rule.period_start, block_rule.period_end, round(block_rule.value_nanos)::bigint, block_rule.limit_nanos, p_now
      from jsonb_to_recordset(v_block_rules) as block_rule(
        rule_id uuid, rolling boolean, window_hours integer, period_start timestamptz, period_end timestamptz, value_nanos numeric,
        limit_nanos bigint, scope_type text, scope_id text, block_free_models boolean)
      where block_rule.limit_nanos > 0
        and block_rule.value_nanos >= block_rule.limit_nanos
        and (block_rule.rolling or p_now < block_rule.period_end)
        and not exists (
          select 1 from public.workspace_spend_blocks active
          where active.rule_id = block_rule.rule_id and active.lifted_at is null
        )
        -- A manual lift holds for the rest of the period, or for one window of a rolling rule.
        and not exists (
          select 1 from public.workspace_spend_blocks lifted
          where lifted.rule_id = block_rule.rule_id
            and lifted.lift_reason = 'manual'
            and case when block_rule.rolling
              then lifted.lifted_at > p_now - make_interval(hours => block_rule.window_hours)
              else lifted.period_start = block_rule.period_start
            end
        )
      on conflict do nothing
      returning block.id, block.rule_id
    loop
      v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
        'block_id', v_block.id, 'rule_id', v_block.rule_id, 'state', 'started', 'reason', null,
        'event_id', private.queue_spend_block_event(v_block.id, 'started', p_now)));
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'blocks', v_blocks,
    'block_scope', jsonb_array_length(v_block_rules) > 0 or jsonb_array_length(v_blocks) > 0 or v_changed > 0
      or exists (select 1 from public.workspace_spend_blocks block where block.workspace_id = p_workspace_id and block.lifted_at is null)
  );
end;
$function$;

COMMENT ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) IS 'Evaluates a workspace''s enabled spend, budget_percent and forecast rules over their calendar period (or rolling window, with a cooldown) at p_now: queues one spend_alert event per rule that crossed, or is projected to cross, a new threshold (the highest one) and per balance rule whose balance or runway dropped to its threshold (armed/unarmed with a cooldown, never while auto top-up is working), lifts blocks that no longer apply and, when p_blocks is true and p_now is current, starts blocks for block rules past their block point. Writes rule state only on fire or period rollover. Called by public.sweep_spend_rules.';

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.preview_workspace_spend_rule (
  p_workspace_id uuid,
  p_rule_id      uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Where a spend rule stands at p_now, computed as the evaluator computes it
-- (private.spend_rule_values) without writing anything: the current period, the value so far,
-- the base and percent, the highest threshold reached, the next threshold, the block point,
-- this period's state row, and the text an alert would carry now (private.spend_rule_alert_text,
-- naming the highest threshold reached, else the first). Used by the control API and web-api
-- preview and by test sends. Balance rules get the rolling burn window as period, the available
-- balance as value, a "balance" object (balance, reserved, available, burn and burn per day,
-- runway, which threshold holds, armed, whether auto top-up covers a drop) and the alert text
-- (private.spend_balance_rule_values / spend_balance_alert_text). Rolling spend and
-- budget_percent rules get their window as period (with window_hours) and their '-infinity'
-- state row. Forecast rules get a "forecast" object (ready, from, projected_nanos and
-- projected_percent, by = the period end, limit_nanos, reaches_at) and their thresholds are
-- measured against the projection; previous_period bases get "previous_period" {start, end}.
-- Spike rules get period, value and alert null. evaluated is false for rules the evaluator does not handle yet
-- (private.spend_rule_evaluable). Errors: spend_rule_not_found (deleted, or another workspace).
declare
  v_rule public.workspace_spend_rules;
  v_workspace_name text;
  v_time_zone text;
  v_evaluated boolean;
  v_value record;
  v_state record;
  v_reached integer;
  v_next integer;
  v_next_nanos numeric;
  v_block_nanos numeric;
  v_alert record;
  v_has_alert boolean := false;
  v_has_state boolean := false;
  v_balance record;
  v_has_balance boolean := false;
  v_measure numeric;
begin
  if p_workspace_id is null or p_rule_id is null or p_now is null then
    raise exception 'invalid_spend_rule_preview' using errcode = '22023';
  end if;

  select rule.* into v_rule
  from public.workspace_spend_rules rule
  where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null;
  if not found then
    raise exception 'spend_rule_not_found' using errcode = 'P0002';
  end if;

  select w.name, coalesce(v_rule.time_zone, settings.billing_time_zone, 'UTC')
    into v_workspace_name, v_time_zone
  from public.workspaces w
  left join public.workspace_settings settings on settings.workspace_id = w.id
  where w.id = p_workspace_id;

  v_evaluated := private.spend_rule_evaluable(v_rule.metric, v_rule.period, v_rule.base_kind);

  if v_rule.metric = 'balance' then
    -- Balance rules: the available balance, the burn over the lookback window and the runway, as
    -- the evaluator sees them (private.spend_balance_rule_values), the armed state and the text.
    select computed.* into v_balance from private.spend_balance_rule_values(p_workspace_id, p_now, p_rule_id) computed;
    v_has_balance := found;
    select state.armed, state.amount_fired_at, state.last_fired_at, state.fire_count
      into v_state
    from public.workspace_spend_rule_state state
    where state.rule_id = v_rule.id and state.period_start = '-infinity'::timestamptz;
    v_has_state := found;
    if v_has_balance then
      -- The text an alert would carry now: the threshold that holds, else the balance amount if
      -- the rule has one, else the runway.
      select alert.* into v_alert
      from private.spend_balance_alert_text(
        v_rule.name, v_balance.available_nanos, v_rule.threshold_amount_nanos, v_rule.runway_days, v_balance.burn_per_day_nanos,
        v_balance.runway_days_left, v_rule.window_hours,
        case
          when v_balance.low_balance then 'balance'
          when v_balance.low_runway then 'runway'
          when v_rule.threshold_amount_nanos is not null then 'balance'
          else 'runway'
        end
      ) alert;
      v_has_alert := found;
    end if;
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', case when v_rule.window_hours is not null then jsonb_build_object(
        'kind', 'rolling', 'start', p_now - make_interval(hours => v_rule.window_hours), 'end', p_now) end,
      'value_nanos', case when v_has_balance then v_balance.available_nanos end,
      'base_kind', null,
      'base_ref', null,
      'base_nanos', null,
      'percent', null,
      'threshold_percents', null,
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'balance', case when v_has_balance then jsonb_build_object(
        'balance_nanos', v_balance.balance_nanos,
        'reserved_nanos', v_balance.reserved_nanos,
        'available_nanos', v_balance.available_nanos,
        'window_hours', v_rule.window_hours,
        'burn_nanos', round(v_balance.burn_nanos),
        'burn_per_day_nanos', round(v_balance.burn_per_day_nanos),
        'runway_days_left', v_balance.runway_days_left,
        'runway_days', v_rule.runway_days,
        'low_balance', v_balance.low_balance,
        'low_runway', v_balance.low_runway,
        'armed', coalesce(v_state.armed, true),
        'auto_top_up_covers', private.workspace_auto_top_up_covers(p_workspace_id)
      ) end,
      'state', case when v_has_state then jsonb_build_object(
        'highest_percent_fired', null,
        'amount_fired_at', v_state.amount_fired_at,
        'last_fired_at', v_state.last_fired_at,
        'fire_count', v_state.fire_count,
        'armed', v_state.armed
      ) end,
      'alert', case when v_has_alert then jsonb_build_object(
        'scope_label', coalesce(nullif(btrim(v_workspace_name), ''), 'Workspace'),
        'title', v_alert.title,
        'message', v_alert.message
      ) end
    );
  end if;

  select computed.* into v_value from private.spend_rule_values(p_workspace_id, p_now, p_rule_id) computed;
  if not found then
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', null,
      'value_nanos', null,
      'base_kind', v_rule.base_kind,
      'base_ref', v_rule.base_ref,
      'base_nanos', null,
      'previous_period', null,
      'forecast', null,
      'percent', null,
      'threshold_percents', to_jsonb(v_rule.threshold_percents),
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'state', null,
      'alert', null
    );
  end if;

  select state.highest_percent_fired, state.amount_fired_at, state.last_fired_at, state.fire_count
    into v_state
  from public.workspace_spend_rule_state state
  where state.rule_id = v_rule.id
    and state.period_start = case when v_rule.period = 'rolling' then '-infinity'::timestamptz else v_value.period_start end;
  v_has_state := found;

  -- What thresholds are measured against: spend so far, or a forecast's projection (none until
  -- the projection is ready).
  v_measure := case when v_rule.metric = 'forecast' then v_value.projected_nanos else v_value.value_nanos end;

  if v_rule.metric in ('budget_percent', 'forecast') and v_value.base_nanos > 0 and v_rule.threshold_percents is not null then
    if v_measure is not null then
      select
        max(threshold) filter (where v_measure * 100 >= threshold::numeric * v_value.base_nanos),
        min(threshold) filter (where v_measure * 100 < threshold::numeric * v_value.base_nanos)
        into v_reached, v_next
      from unnest(v_rule.threshold_percents) threshold;
    else
      v_next := v_rule.threshold_percents[1];
    end if;
    v_next_nanos := ceil(v_next::numeric * v_value.base_nanos / 100);
  elsif v_rule.threshold_amount_nanos is not null and (v_measure is null or v_measure < v_rule.threshold_amount_nanos) then
    v_next_nanos := v_rule.threshold_amount_nanos;
  end if;

  if v_rule.action = 'block' then
    v_block_nanos := case
      when v_rule.metric = 'spend' then v_rule.block_at_amount_nanos
      when v_value.base_nanos > 0 then ceil(v_rule.block_at_percent::numeric * v_value.base_nanos / 100)
    end;
  end if;

  if v_rule.metric = 'spend'
    or (v_rule.metric = 'budget_percent' and v_value.base_nanos > 0)
    or (v_rule.metric = 'forecast' and v_value.projected_nanos is not null
      and (v_rule.threshold_amount_nanos is not null or v_value.base_nanos > 0)) then
    select alert.* into v_alert
    from private.spend_rule_alert_text(
      v_workspace_name, v_rule.name, v_rule.metric, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id,
      v_rule.scope_user_id, v_rule.scope_department_id, v_rule.period, v_value.period_end, v_value.time_zone,
      v_rule.base_kind, v_rule.base_ref, v_value.base_nanos, v_rule.threshold_percents, v_rule.threshold_amount_nanos,
      v_value.value_nanos, coalesce(v_reached, v_rule.threshold_percents[1]), v_rule.window_hours, v_value.projected_nanos,
      v_value.reaches_at
    ) alert;
    v_has_alert := found;
  end if;

  return jsonb_build_object(
    'rule_id', v_rule.id,
    'metric', v_rule.metric,
    'evaluated', v_evaluated,
    'computed_at', p_now,
    'time_zone', v_value.time_zone,
    'period', jsonb_strip_nulls(jsonb_build_object('kind', v_rule.period, 'start', v_value.period_start, 'end', v_value.period_end,
      'window_hours', v_value.window_hours)),
    'value_nanos', v_value.value_nanos,
    'base_kind', v_rule.base_kind,
    'base_ref', v_rule.base_ref,
    'base_nanos', v_value.base_nanos,
    'previous_period', case when v_value.previous_start is not null then jsonb_build_object(
      'start', v_value.previous_start, 'end', v_value.previous_end) end,
    'forecast', case when v_rule.metric = 'forecast' then jsonb_build_object(
      'ready', v_value.projected_nanos is not null,
      'from', v_value.forecast_from,
      'projected_nanos', v_value.projected_nanos,
      'projected_percent', case when v_value.base_nanos > 0 and v_value.projected_nanos is not null
        then round(v_value.projected_nanos * 100 / v_value.base_nanos, 1) end,
      'by', v_value.period_end,
      'limit_nanos', v_value.limit_nanos,
      'reaches_at', v_value.reaches_at
    ) end,
    'percent', case when v_value.base_nanos > 0 then round(v_value.value_nanos * 100 / v_value.base_nanos, 1) end,
    'threshold_percents', to_jsonb(v_rule.threshold_percents),
    'threshold_amount_nanos', v_rule.threshold_amount_nanos,
    'reached_threshold_percent', v_reached,
    'next_threshold', case when v_next_nanos is not null then jsonb_build_object('percent', v_next, 'amount_nanos', v_next_nanos) end,
    'block_at_nanos', v_block_nanos,
    'state', case when v_has_state then jsonb_build_object(
      'highest_percent_fired', v_state.highest_percent_fired,
      'amount_fired_at', v_state.amount_fired_at,
      'last_fired_at', v_state.last_fired_at,
      'fire_count', v_state.fire_count
    ) end,
    'alert', case when v_has_alert then jsonb_build_object(
      'scope_label', v_alert.scope_label,
      'title', v_alert.title,
      'message', v_alert.message
    ) end
  );
end;
$function$;

COMMENT ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) IS 'Read-only preview of a spend rule at p_now: period, value, base, percent, thresholds reached and next, block point, state and the alert text, computed by the evaluator''s own functions. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "anon", "authenticated";
