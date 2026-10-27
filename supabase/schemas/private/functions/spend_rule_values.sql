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
    base_nanos             bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The current value and base of spend rules over their calendar period at p_now: the one
  -- definition of "spend so far" that the evaluator (private.evaluate_workspace_spend_rules),
  -- the API preview (public.preview_workspace_spend_rule) and test sends share.
  --   * Without p_rule_id: the workspace's enabled, non-deleted rules that
  --     private.spend_rule_evaluable accepts (what the evaluator fires on).
  --   * With p_rule_id: that rule if it is not deleted, enabled or not, whatever its metric, as
  --     long as it has a calendar period (rolling rules have none, so no row).
  --   * Zone: the rule's time_zone, else the workspace's billing_time_zone, else UTC.
  --   * Spend: v2_private_usage_15m from the period start up to p_now, plus successful async
  --     jobs and realtime sessions from gateway_requests (as sweep_spend_limit_warnings adds
  --     them). The rollup is read as it stands. Usage is read once per workspace and split at
  --     each distinct period start, so every rule sums a handful of rows.
  --   * Scopes: workspace; key (key_id); member (actor_user_id: their keys and OAuth requests);
  --     department (private.spend_scope_departments, read now); model (model_id); provider (the
  --     route's provider_slug, or gateway_requests.provider for async jobs).
  --   * Bases: amount (base_amount_nanos), workspace_budget (the workspace_budgets row for
  --     base_ref), key_limit (the key's *_limit_cost_nanos, 0 = none). Other bases are null.
  with settings as (
    select coalesce((
      select s.billing_time_zone from public.workspace_settings s where s.workspace_id = p_workspace_id
    ), 'UTC') as time_zone
  ),
  rules as materialized (
    select
      rule.id, rule.name, rule.metric, rule.action, rule.scope_type, rule.scope_id, rule.scope_key_id, rule.scope_user_id,
      rule.scope_department_id, rule.period, rule.base_kind, rule.base_ref, rule.base_amount_nanos,
      rule.threshold_percents, rule.threshold_amount_nanos, zone.time_zone, period.period_start, period.period_end
    from public.workspace_spend_rules rule
    cross join settings
    cross join lateral (select coalesce(rule.time_zone, settings.time_zone) as time_zone) zone
    cross join lateral private.spend_rule_period(rule.period, zone.time_zone, p_now) period
    where rule.workspace_id = p_workspace_id
      and rule.deleted_at is null
      and case
        when p_rule_id is null then rule.enabled and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
        else rule.id = p_rule_id
      end
  ),
  starts as materialized (
    select distinct rules.period_start from rules
  ),
  raw as (
    select rollup.bucket_start as at, rollup.key_id, rollup.actor_user_id, rollup.model_id, rollup.provider_model_id,
      null::text as provider, rollup.cost_nanos
    from public.v2_private_usage_15m rollup
    where rollup.workspace_id = p_workspace_id
      and rollup.bucket_start >= (select min(starts.period_start) from starts)
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
      and request.created_at >= (select min(starts.period_start) from starts)
      and request.created_at < p_now
  ),
  segments as materialized (
    -- Spend per segment (the latest period start at or before the usage) and attribution.
    select segment.period_start as segment_start, raw.key_id, raw.actor_user_id, raw.model_id, raw.provider_model_id, raw.provider,
      sum(raw.cost_nanos) as cost_nanos
    from raw
    cross join lateral (select max(starts.period_start) as period_start from starts where starts.period_start <= raw.at) segment
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
  )
  select rules.*,
    coalesce((
      select sum(usage.cost_nanos)
      from usage
      where usage.segment_start >= rules.period_start
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
    ), 0) as value_nanos,
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
    end as base_nanos
  from rules;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) IS 'Spend so far (value_nanos) and the percentage base (base_nanos) of spend rules over their calendar period at p_now. Without p_rule_id: the enabled rules the evaluator handles; with it: that non-deleted rule. Shared by the evaluator, the API preview and test sends.';

REVOKE ALL ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_values"(uuid, timestamp with time zone, uuid) TO "service_role";
