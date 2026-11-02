-- Spend rules spike (PR 11 of the spend rules stack): spike rules are evaluated.
-- * private.spend_rule_evaluable: spike rules (rolling, no base) are evaluated.
-- * private.spend_spike_rule_values: spend over the last window_hours against the median of the
--   same window over the previous 7 days (the same hours on each of the 7 days before for windows
--   under 24 hours, else the non-overlapping windows that fit in 7 days, at least 3), read from the
--   15-minute rollup with one range scan per window; ready once the workspace spent in at least 3
--   baseline windows; spiking at spike_multiplier x the median and spike_floor_nanos.
-- * private.spend_spike_alert_text: "Spend in the last 3 hours is $42.10, 4.2× your usual $10.02
--   for this time of day."
-- * private.evaluate_workspace_spend_rules: spike alerts with cooldown_minutes (state row
--   '-infinity').
-- * public.preview_workspace_spend_rule: a "spike" object (current, baseline, multiple, fires at).
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
  --   * balance rules (workspace scope, rolling: window_hours is the burn-rate lookback);
  --   * spike rules (rolling: window_hours is the spike window, compared with the median of the
  --     same window over the previous 7 days; private.spend_spike_rule_values).
  -- Every metric is evaluated now; this stays the one switch the sweep's passes and the
  -- evaluator share.
  select (p_metric in ('spend', 'budget_percent', 'forecast')
      and p_period in ('day', 'week', 'month')
      and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit', 'previous_period')))
    or (p_metric in ('spend', 'budget_percent') and p_period = 'rolling' and (p_base_kind is null or p_base_kind in ('amount', 'previous_period')))
    or (p_metric in ('balance', 'spike') and p_period = 'rolling' and p_base_kind is null);
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend, budget_percent and forecast over a calendar day, week or month (amount, workspace_budget, key_limit or previous_period base), spend and budget_percent over a rolling window (amount or previous_period base), balance rules (rolling burn-rate window) and spike rules (a rolling window against the median of the same window over the previous 7 days).';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";

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

CREATE OR REPLACE FUNCTION private.spend_spike_alert_text (
  p_workspace_name      text,
  p_rule_name           text,
  p_scope_type          text,
  p_scope_id            text,
  p_scope_key_id        uuid,
  p_scope_user_id       uuid,
  p_scope_department_id uuid,
  p_window_hours        integer,
  p_current_nanos       numeric,
  p_baseline_nanos      numeric,
  p_multiple            numeric,
  p_multiplier          numeric,
  p_floor_nanos         bigint,
  p_baseline_windows    integer
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
  -- The text of a spike alert, in US money format: the scope's label, the title and the message,
  -- e.g. "Spend in the last 3 hours is $42.10, 4.2× your usual $10.02 for this time of day." With
  -- a baseline of 0 the message says that only the floor applied. Used by
  -- private.evaluate_workspace_spend_rules for real alerts and by public.preview_workspace_spend_rule
  -- for previews and test sends, so both read the same.
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
        when 'workspace' then ''
        when 'key' then ' by API key ''' || coalesce(left(label.label, 60), 'deleted key') || ''''
        when 'member' then ' by ' || coalesce(label.label, 'a former member')
        when 'department' then ' by department ''' || coalesce(left(label.label, 60), 'deleted department') || ''''
        when 'model' then ' on ' || coalesce(label.label, p_scope_id)
        else ' on provider ' || p_scope_id
      end as subject,
      case when p_scope_type = 'workspace' then 'your' else 'its' end as whose,
      case when p_window_hours = 1 then 'hour' else p_window_hours || ' hours' end as hours,
      private.workspace_push_usd(round(p_current_nanos)::bigint) as current_text,
      private.workspace_push_usd(round(p_baseline_nanos)::bigint) as baseline_text,
      private.workspace_push_usd(p_floor_nanos) as floor_text,
      pg_catalog.trim_scale(round(p_multiple, 1))::text || '×' as multiple_text,
      pg_catalog.trim_scale(p_multiplier)::text || '×' as multiplier_text
    from label
  )
  select
    parts.scope_label,
    left(p_rule_name, 100) || ': ' || case
      when p_baseline_nanos > 0 then 'spend ' || parts.multiple_text || ' usual in the last ' || parts.hours
      else parts.current_text || ' spent in the last ' || parts.hours
    end,
    'Spend' || parts.subject || ' in the last ' || parts.hours || ' is ' || parts.current_text
      || case
        when p_baseline_nanos > 0 then
          ', ' || parts.multiple_text || ' ' || parts.whose || ' usual ' || parts.baseline_text
            || case when p_window_hours < 24 then ' for this time of day.' else ' for ' || p_window_hours || ' hours.' end
            || case when p_window_hours < 24
              then ' The usual is the median of the same ' || parts.hours || ' on each of the previous 7 days.'
              else ' The usual is the median of the previous ' || p_baseline_windows || ' windows of ' || p_window_hours || ' hours.'
            end
            || ' Alerts at ' || parts.multiplier_text || ' and ' || parts.floor_text || ' or more.'
        else
          '. There was no spend in '
            || case when p_window_hours < 24 then 'the same ' || parts.hours || ' on the previous 7 days' else 'the previous 7 days' end
            || ', so this alert uses only the ' || parts.floor_text || ' floor.'
      end
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) IS 'Scope label, title and message of a spike spend alert (spend over the last window_hours against the median of the same window over the previous 7 days). Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_spike_alert_text"(text, text, text, text, uuid, uuid, uuid, integer, numeric, numeric, numeric, numeric, bigint, integer) TO "service_role";

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
--     Monday week or month; spend and budget_percent over a rolling window; balance and spike
--     rules). Each calendar rule's period is in its own time zone, or the
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
--   * Spike rules (rolling; never block): values from private.spend_spike_rule_values (spend over
--     the last window_hours in the rule's scope against the median of the same window over the
--     previous 7 days; ready once the workspace spent in at least 3 baseline windows). A rule
--     fires when spend is at least spike_multiplier x the median and at least spike_floor_nanos
--     (a median of 0 leaves only the floor, and the message says so), at most once per
--     cooldown_minutes (state row '-infinity', written only on fire). Dedupe:
--     spend_alert:<rule id>:cooldown:<epoch / cooldown>:spike. Sweep events carry the multiplier
--     as threshold and trigger 'spike'.
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
  v_spike jsonb;
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

  -- Spike rules: spend over the window against the median of the same window over the previous
  -- 7 days, at most one alert per cooldown. Skipped (and free) for workspaces without them.
  v_spike := jsonb_build_object('rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb);
  if exists (
    select 1 from public.workspace_spend_rules rule
    where rule.workspace_id = p_workspace_id and rule.metric = 'spike' and rule.enabled and rule.deleted_at is null
  ) then
    with spike as materialized (
      select * from private.spend_spike_rule_values(p_workspace_id, p_now)
    ),
    decided as (
      select spike.*,
        coalesce(state.last_fired_at > p_now - make_interval(mins => spike.cooldown_minutes), false) as cooling
      from spike
      left join public.workspace_spend_rule_state state
        on state.rule_id = spike.id and state.period_start = '-infinity'::timestamptz
      where spike.spiking
    ),
    rendered as (
      select decided.*, alert.scope_label, alert.title, alert.message,
        'spend_alert:' || decided.id || ':cooldown:' || floor(extract(epoch from p_now) / (decided.cooldown_minutes * 60))::bigint
          || ':spike' as dedupe_key
      from decided
      cross join lateral private.spend_spike_alert_text(
        v_workspace.name, decided.name, decided.scope_type, decided.scope_id, decided.scope_key_id, decided.scope_user_id,
        decided.scope_department_id, decided.window_hours, decided.current_nanos, decided.baseline_nanos, decided.multiple,
        decided.spike_multiplier, decided.spike_floor_nanos, decided.baseline_windows
      ) alert
      where not decided.cooling
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
          'metric', 'spike',
          'action', rendered.action,
          'scope', jsonb_strip_nulls(jsonb_build_object(
            'type', rendered.scope_type,
            'id', rendered.scope_id,
            'label', rendered.scope_label,
            'key_id', rendered.scope_key_id,
            'user_id', rendered.scope_user_id,
            'department_id', rendered.scope_department_id
          )),
          'period', jsonb_build_object(
            'kind', 'rolling',
            'start', rendered.period_start,
            'end', rendered.period_end,
            'time_zone', rendered.time_zone,
            'window_hours', rendered.window_hours
          ),
          'value_nanos', rendered.current_nanos,
          'base_nanos', rendered.baseline_nanos,
          'threshold_percent', null,
          'threshold_amount_nanos', null,
          'spike', jsonb_build_object(
            'current_nanos', rendered.current_nanos,
            'baseline_nanos', rendered.baseline_nanos,
            'multiple', rendered.multiple,
            'multiplier', rendered.spike_multiplier,
            'floor_nanos', rendered.spike_floor_nanos,
            'fires_at_nanos', rendered.fires_at_nanos,
            'baseline_windows', rendered.baseline_windows,
            'active_windows', rendered.active_windows,
            'floor_only', not (rendered.baseline_nanos > 0)
          ),
          'cooldown_minutes', rendered.cooldown_minutes,
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
      -- One '-infinity' row per spike rule, written only when it fires (the cooldown starts again).
      insert into public.workspace_spend_rule_state as state (
        rule_id, workspace_id, period_start, period_end, last_fired_at, fire_count, last_value_nanos, last_base_nanos, last_dedupe_key
      )
      select rendered.id, p_workspace_id, '-infinity'::timestamptz, null, p_now, 1, round(rendered.current_nanos)::bigint,
        round(rendered.baseline_nanos)::bigint, rendered.dedupe_key
      from rendered
      on conflict (rule_id, period_start) do update set
        last_fired_at = excluded.last_fired_at,
        fire_count = state.fire_count + 1,
        last_value_nanos = excluded.last_value_nanos,
        last_base_nanos = excluded.last_base_nanos,
        last_dedupe_key = excluded.last_dedupe_key
      returning 1
    )
    select jsonb_build_object(
      'rules', (select count(*) from spike),
      'fired', (select count(*) from queued),
      'state_rows', (select count(*) from saved),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'event_id', queued.id,
          'rule_id', queued.payload ->> 'rule_id',
          'dedupe_key', queued.dedupe_key,
          'threshold', queued.payload -> 'spike' -> 'multiplier',
          'trigger', 'spike'
        ) order by queued.dedupe_key)
        from queued
      ), '[]'::jsonb)
    ) into v_spike;
  end if;

  v_result := v_result || jsonb_build_object(
    'rules', (v_result ->> 'rules')::integer + (v_balance ->> 'rules')::integer + (v_spike ->> 'rules')::integer,
    'fired', (v_result ->> 'fired')::integer + (v_balance ->> 'fired')::integer + (v_spike ->> 'fired')::integer,
    'state_rows', (v_result ->> 'state_rows')::integer + (v_balance ->> 'state_rows')::integer + (v_spike ->> 'state_rows')::integer,
    'events', (v_result -> 'events') || (v_balance -> 'events') || (v_spike -> 'events')
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

COMMENT ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) IS 'Evaluates a workspace''s enabled spend, budget_percent and forecast rules over their calendar period (or rolling window, with a cooldown) at p_now: queues one spend_alert event per rule that crossed, or is projected to cross, a new threshold (the highest one) and per balance rule whose balance or runway dropped to its threshold (armed/unarmed with a cooldown, never while auto top-up is working) and per spike rule whose spend over its window reached spike_multiplier x the median of the same window over the previous 7 days and its floor (with a cooldown), lifts blocks that no longer apply and, when p_blocks is true and p_now is current, starts blocks for block rules past their block point. Writes rule state only on fire or period rollover. Called by public.sweep_spend_rules.';

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
-- Spike rules get their window as period, spend over it as value, the median of the same window
-- over the previous 7 days as base_nanos (percent = value / median), the point they fire at as
-- next_threshold (while ready and not spiking), a "spike" object (window_hours, current, baseline,
-- multiple, multiplier, floor, fires_at, baseline_windows, active_windows, history_ready, spiking,
-- cooldown_until) and the alert text (private.spend_spike_rule_values / spend_spike_alert_text).
-- Every other metric gets "spike": null. evaluated is false for rules the evaluator does not
-- handle (private.spend_rule_evaluable). Errors: spend_rule_not_found (deleted, or another
-- workspace).
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
  v_spike record;
  v_has_spike boolean := false;
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

  if v_rule.metric = 'spike' then
    -- Spike rules: spend over the window, the median of the same window over the previous 7 days,
    -- the multiple and the point the rule fires at, as the evaluator sees them
    -- (private.spend_spike_rule_values), the cooldown state and the text.
    select computed.* into v_spike from private.spend_spike_rule_values(p_workspace_id, p_now, p_rule_id) computed;
    v_has_spike := found;
    select state.last_fired_at, state.fire_count into v_state
    from public.workspace_spend_rule_state state
    where state.rule_id = v_rule.id and state.period_start = '-infinity'::timestamptz;
    v_has_state := found;
    if v_has_spike and v_spike.baseline_windows >= 3 then
      select alert.* into v_alert
      from private.spend_spike_alert_text(
        v_workspace_name, v_rule.name, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id, v_rule.scope_user_id,
        v_rule.scope_department_id, v_rule.window_hours, v_spike.current_nanos, v_spike.baseline_nanos, v_spike.multiple,
        v_rule.spike_multiplier, v_rule.spike_floor_nanos, v_spike.baseline_windows
      ) alert;
      v_has_alert := found;
    end if;
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', case when v_has_spike then jsonb_build_object(
        'kind', 'rolling', 'start', v_spike.period_start, 'end', v_spike.period_end, 'window_hours', v_rule.window_hours) end,
      'value_nanos', case when v_has_spike then v_spike.current_nanos end,
      'base_kind', null,
      'base_ref', null,
      'base_nanos', case when v_has_spike then v_spike.baseline_nanos end,
      'previous_period', null,
      'forecast', null,
      'percent', case when v_spike.baseline_nanos > 0 then round(v_spike.current_nanos * 100 / v_spike.baseline_nanos, 1) end,
      'threshold_percents', null,
      'threshold_amount_nanos', null,
      'reached_threshold_percent', null,
      'next_threshold', case when v_has_spike and not v_spike.spiking and v_spike.history_ready then jsonb_build_object(
        'percent', null, 'amount_nanos', v_spike.fires_at_nanos) end,
      'block_at_nanos', null,
      'balance', null,
      'spike', case when v_has_spike then jsonb_build_object(
        'window_hours', v_rule.window_hours,
        'current_nanos', v_spike.current_nanos,
        'baseline_nanos', v_spike.baseline_nanos,
        'multiple', v_spike.multiple,
        'multiplier', v_rule.spike_multiplier,
        'floor_nanos', v_rule.spike_floor_nanos,
        'fires_at_nanos', v_spike.fires_at_nanos,
        'baseline_windows', v_spike.baseline_windows,
        'active_windows', v_spike.active_windows,
        'history_ready', v_spike.history_ready,
        'spiking', v_spike.spiking,
        'cooldown_until', case when v_state.last_fired_at + make_interval(mins => v_rule.cooldown_minutes) > p_now
          then v_state.last_fired_at + make_interval(mins => v_rule.cooldown_minutes) end
      ) end,
      'state', case when v_has_state then jsonb_build_object(
        'highest_percent_fired', null,
        'amount_fired_at', null,
        'last_fired_at', v_state.last_fired_at,
        'fire_count', v_state.fire_count
      ) end,
      'alert', case when v_has_alert then jsonb_build_object(
        'scope_label', v_alert.scope_label,
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

