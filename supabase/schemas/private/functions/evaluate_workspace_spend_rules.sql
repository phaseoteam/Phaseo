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
