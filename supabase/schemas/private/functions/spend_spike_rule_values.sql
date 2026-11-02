CREATE OR REPLACE FUNCTION private.spend_spike_rule_values (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_rule_id      uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id                  uuid,
    name                text,
    action              text,
    scope_type          text,
    scope_id            text,
    scope_key_id        uuid,
    scope_user_id       uuid,
    scope_department_id uuid,
    time_zone           text,
    window_hours        integer,
    cooldown_minutes    integer,
    spike_multiplier    numeric,
    spike_floor_nanos   bigint,
    period_start        timestamp with time zone,
    period_end          timestamp with time zone,
    current_nanos       numeric,
    baseline_nanos      numeric,
    multiple            numeric,
    baseline_windows    integer,
    active_windows      integer,
    history_ready       boolean,
    fires_at_nanos      numeric,
    spiking             boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Where spike spend rules stand at p_now: the one definition the evaluator
  -- (private.evaluate_workspace_spend_rules) and the API preview (public.preview_workspace_spend_rule)
  -- share.
  --   * Without p_rule_id: the workspace's enabled, non-deleted spike rules that
  --     private.spend_rule_evaluable accepts. With p_rule_id: that spike rule if it is not deleted.
  --   * Current: spend in the rule's scope over the last window_hours, [p_now - window, p_now).
  --   * Baseline: the median of the same window over the previous 7 days. A window under 24 hours
  --     is compared with the same hours on each of the 7 days before (the windows ending exactly
  --     1..7 x 24 hours before p_now); a window of 24 hours or more with the non-overlapping
  --     windows before it that fit in 7 days (floor(168 / window_hours) of them). Windows are
  --     counted in hours, not on a local clock, so a rule's time zone never changes the result.
  --     Windows without spend count as 0. baseline_windows is how many there are.
  --   * Spend is counted as the other rules count it: v2_private_usage_15m buckets starting in a
  --     window, plus successful async jobs and realtime sessions from gateway_requests, with the
  --     same scopes (workspace, key, member, department read now, model, provider).
  --   * History: a rule is ready once it has at least 3 baseline windows and the workspace (any
  --     scope) spent something in at least 3 of them. Measured on the workspace so that a new
  --     key, member or model that suddenly spends in an established workspace still alerts.
  --     A window over 56 hours leaves fewer than 3 windows in 7 days and is never ready.
  --   * Spiking: ready, current > 0, current >= spike_multiplier x baseline and current >=
  --     spike_floor_nanos (fires_at_nanos is the larger of the two). A baseline of 0 leaves only
  --     the floor.
  --   * Cost: each window is read with one index range scan of the rollup (and of
  --     gateway_requests_async_spend_idx), once per distinct window across the workspace's
  --     spike rules: 1 + baseline_windows windows, so about 8 x window_hours of buckets.
  with settings as (
    select coalesce((
      select s.billing_time_zone from public.workspace_settings s where s.workspace_id = p_workspace_id
    ), 'UTC') as time_zone
  ),
  rules as materialized (
    select rule.id, rule.name, rule.action, rule.scope_type, rule.scope_id, rule.scope_key_id, rule.scope_user_id,
      rule.scope_department_id, coalesce(rule.time_zone, settings.time_zone) as time_zone, rule.window_hours,
      rule.cooldown_minutes, rule.spike_multiplier, rule.spike_floor_nanos,
      case when rule.window_hours < 24 then 7 else 168 / rule.window_hours end as baseline_windows,
      case when rule.window_hours < 24 then 24 else rule.window_hours end as step_hours
    from public.workspace_spend_rules rule
    cross join settings
    where rule.workspace_id = p_workspace_id
      and rule.deleted_at is null
      and rule.metric = 'spike'
      and rule.period = 'rolling'
      and rule.window_hours is not null
      and case
        when p_rule_id is null then rule.enabled and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
        else rule.id = p_rule_id
      end
  ),
  windows as materialized (
    -- Window 0 is the current one; 1..baseline_windows the baseline. Rules with the same
    -- window_hours share their windows.
    select distinct rules.window_hours, slot.k,
      p_now - make_interval(hours => slot.k * rules.step_hours + rules.window_hours) as window_start,
      p_now - make_interval(hours => slot.k * rules.step_hours) as window_end
    from rules
    cross join lateral generate_series(0, rules.baseline_windows) slot(k)
  ),
  raw as (
    select windows.window_hours, windows.k, rollup.key_id, rollup.actor_user_id, rollup.model_id, rollup.provider_model_id,
      null::text as provider, sum(rollup.cost_nanos) as cost_nanos
    from windows
    join public.v2_private_usage_15m rollup
      on rollup.workspace_id = p_workspace_id
      and rollup.bucket_start >= windows.window_start
      and rollup.bucket_start < windows.window_end
    group by 1, 2, 3, 4, 5, 6
    union all
    -- gateway_requests_async_spend_idx
    select windows.window_hours, windows.k, request.key_id, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by),
      request.model_id, null, request.provider, sum(coalesce(request.cost_nanos, 0))::numeric
    from windows
    join public.gateway_requests request
      on request.success is true
      and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
      and request.workspace_id = p_workspace_id
      and request.created_at >= windows.window_start
      and request.created_at < windows.window_end
    left join public.keys key on key.id = request.key_id
    group by 1, 2, 3, 4, 5, 6, 7
  ),
  usage as materialized (
    select raw.window_hours, raw.k, raw.key_id, raw.actor_user_id, raw.model_id,
      coalesce(raw.provider, route.provider_slug) as provider, raw.cost_nanos
    from raw
    left join public.v2_model_provider_routes route on route.provider_model_id = raw.provider_model_id
  ),
  departments as materialized (
    select pair.key_id, pair.actor_user_id, scope.department_id
    from (select distinct usage.key_id, usage.actor_user_id from usage) pair
    cross join lateral private.spend_scope_departments(p_workspace_id, pair.key_id, pair.actor_user_id) scope(department_id)
    where exists (select 1 from rules where rules.scope_type = 'department')
  ),
  per_window as (
    -- Spend in the rule's scope and in the whole workspace, per window.
    select rules.id, windows.k, sums.scoped_nanos, sums.workspace_nanos,
      row_number() over (partition by rules.id, windows.k = 0 order by sums.scoped_nanos) as rank
    from rules
    join windows on windows.window_hours = rules.window_hours and windows.k <= rules.baseline_windows
    cross join lateral (
      select
        coalesce(sum(usage.cost_nanos) filter (where case rules.scope_type
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
        end), 0) as scoped_nanos,
        coalesce(sum(usage.cost_nanos), 0) as workspace_nanos
      from usage
      where usage.window_hours = windows.window_hours and usage.k = windows.k
    ) sums
  ),
  summary as (
    -- The median of the baseline windows: the middle one, or the mean of the middle two.
    select rules.id,
      coalesce(max(per_window.scoped_nanos) filter (where per_window.k = 0), 0) as current_nanos,
      avg(per_window.scoped_nanos) filter (where per_window.k > 0
        and per_window.rank in ((rules.baseline_windows + 1) / 2, (rules.baseline_windows + 2) / 2)) as baseline_nanos,
      count(*) filter (where per_window.k > 0 and per_window.workspace_nanos > 0)::integer as active_windows
    from rules
    left join per_window on per_window.id = rules.id
    group by rules.id, rules.baseline_windows
  ),
  measured as (
    select rules.*, summary.current_nanos, round(coalesce(summary.baseline_nanos, 0)) as baseline_nanos, summary.active_windows,
      rules.baseline_windows >= 3 and summary.active_windows >= 3 as history_ready
    from rules
    join summary on summary.id = rules.id
  )
  select measured.id, measured.name, measured.action, measured.scope_type, measured.scope_id, measured.scope_key_id,
    measured.scope_user_id, measured.scope_department_id, measured.time_zone, measured.window_hours, measured.cooldown_minutes,
    measured.spike_multiplier, measured.spike_floor_nanos,
    p_now - make_interval(hours => measured.window_hours), p_now,
    measured.current_nanos, measured.baseline_nanos,
    case when measured.baseline_nanos > 0 then round(measured.current_nanos / measured.baseline_nanos, 2) end,
    measured.baseline_windows, measured.active_windows, measured.history_ready,
    greatest(ceil(measured.spike_multiplier * measured.baseline_nanos), measured.spike_floor_nanos),
    measured.history_ready and measured.current_nanos > 0
      and measured.current_nanos >= measured.spike_multiplier * measured.baseline_nanos
      and measured.current_nanos >= measured.spike_floor_nanos
  from measured;
$function$;

COMMENT ON FUNCTION "private"."spend_spike_rule_values"(uuid, timestamp with time zone, uuid) IS 'Spike spend rules at p_now: spend over the last window_hours, the median of the same window over the previous 7 days (same hours on each of the 7 days before for windows under 24 hours, else the non-overlapping windows that fit in 7 days), the multiple, whether the workspace has enough history (spend in at least 3 baseline windows) and whether the rule is spiking (current at least spike_multiplier x baseline and spike_floor_nanos). Shared by the evaluator and the API preview.';

REVOKE ALL ON FUNCTION "private"."spend_spike_rule_values"(uuid, timestamp with time zone, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_spike_rule_values"(uuid, timestamp with time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_rule_values"(uuid, timestamp with time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_rule_values"(uuid, timestamp with time zone, uuid) TO "service_role";
