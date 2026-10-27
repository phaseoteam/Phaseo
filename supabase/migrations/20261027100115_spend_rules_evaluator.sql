-- phaseo:allow-destructive-migration reason: the DELETE and TRUNCATE statements are the existing summary rebuilds inside process_v2_analytics_outbox, recreated unchanged apart from one INSERT that marks workspace_spend_rule_dirty, and the new sweep's claim of workspace_spend_rule_dirty rows. The migration deletes no data.

-- Spend rules evaluator (PR 5 of the spend rules stack). Notify only: nothing is blocked.
-- * process_v2_analytics_outbox marks rebuilt workspaces that have an enabled spend rule in
--   workspace_spend_rule_dirty (one set-based INSERT per run).
-- * public.sweep_spend_rules(p_now, p_limit) evaluates dirty workspaces (claimed with SKIP LOCKED),
--   rules whose period rolled over, and an hourly slice of all workspaces with rules, through
--   private.evaluate_workspace_spend_rules(p_workspace_id, p_now) (spend and budget_percent over
--   calendar periods in the rule's time zone; helpers private.spend_rule_period and
--   private.spend_rule_evaluable).
-- * Fired rules queue spend_alert events in email_outbox. enqueue_notification_event_deliveries
--   sends them to the rule's own destinations when it has any, else the workspace routes;
--   capture_workspace_notification_events turns them into money pushes.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.spend_rule_period (
  p_period    text,
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    period_start timestamp with time zone,
    period_end   timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The calendar period of a spend rule that contains p_now, in p_time_zone: a day, a week from
  -- Monday, or a month, from local midnight to local midnight. Computed on the local wall clock
  -- and converted back, so a day across a DST change lasts 23 or 25 hours. No row for any
  -- other period (rolling rules have none).
  select
    local.start_at at time zone p_time_zone,
    (local.start_at + case p_period when 'day' then interval '1 day' when 'week' then interval '7 days' else interval '1 month' end)
      at time zone p_time_zone
  from (
    select date_trunc(case when p_period in ('day', 'week', 'month') then p_period else 'day' end, p_now at time zone p_time_zone) as start_at
  ) local
  where p_period in ('day', 'week', 'month');
$function$;

COMMENT ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) IS 'The day, Monday week or month containing p_now in p_time_zone, as [period_start, period_end). No row for rolling periods.';

REVOKE ALL ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_period"(text, text, timestamp with time zone) TO "service_role";

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
  -- Which spend rules private.evaluate_workspace_spend_rules handles so far: spend and
  -- budget_percent over a calendar day, week or month, with an amount, workspace budget or key
  -- limit base. Forecast, spike, balance, rolling windows and previous_period bases are added
  -- by later changes, which widen this test so that the sweep's rollover pass and the
  -- evaluator stay in step.
  select p_metric in ('spend', 'budget_percent')
    and p_period in ('day', 'week', 'month')
    and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit'));
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend and budget_percent (amount, workspace_budget or key_limit base) over a calendar day, week or month.';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";

CREATE OR REPLACE FUNCTION private.evaluate_workspace_spend_rules (
  p_workspace_id uuid,
  p_now          timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates a workspace's enabled spend rules at p_now and queues an alert for each rule that
-- crossed a threshold. Notify only: nothing is blocked here.
--   * Rules: private.spend_rule_evaluable (spend and budget_percent over a calendar day, Monday
--     week or month); other metrics are left for later. Each rule's period is in its own time
--     zone, or the workspace's billing_time_zone (private.spend_rule_period).
--   * Spend: v2_private_usage_15m from the period start up to p_now, plus successful async jobs
--     and realtime sessions from gateway_requests (as sweep_spend_limit_warnings adds them).
--     The rollup is read as it stands: hours the outbox has yet to rebuild count once it marks
--     the workspace dirty again. Usage is read once per workspace and split at each distinct
--     period start, so every rule sums a handful of rows.
--   * Scopes: workspace; key (key_id); member (actor_user_id: their keys and OAuth requests);
--     department (private.spend_scope_departments, read now, so moving someone moves their
--     spend for the current period); model (model_id); provider (the route's provider_slug,
--     or gateway_requests.provider for async jobs).
--   * Bases for budget_percent: amount (base_amount_nanos), workspace_budget (the
--     workspace_budgets row for base_ref) and key_limit (the key's *_limit_cost_nanos). A rule
--     whose budget or limit is missing or 0 does not fire.
--   * Firing: each threshold at most once per period. Several crossed at once make one event
--     naming the highest. A spend rule fires once per period at threshold_amount_nanos.
--   * Each event is an email_outbox row of kind spend_alert, deduped by
--     spend_alert:<rule id>:<period start, UTC ISO>:<threshold percent, or amount-<nanos>>, with
--     its text in payload.title / payload.message and a payload.push for the mobile app. The
--     routed delivery job sends it to the rule's destinations, or else the workspace's
--     spend_alert routes; mobile push picks it up as a money push.
--   * workspace_spend_rule_state is written only when a rule fires, or for the first evaluation
--     in a period (the rollover row), never on a quiet re-evaluation.
-- Returns {rules, fired, state_rows, events: [{event_id, rule_id, dedupe_key, threshold}]}.
declare
  v_workspace record;
  v_result jsonb;
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
    return jsonb_build_object('rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'missing', true);
  end if;

  with rules as materialized (
    select
      rule.id, rule.name, rule.metric, rule.action, rule.scope_type, rule.scope_id, rule.scope_key_id, rule.scope_user_id,
      rule.scope_department_id, rule.period, rule.base_kind, rule.base_ref, rule.base_amount_nanos,
      rule.threshold_percents, rule.threshold_amount_nanos, zone.time_zone, period.period_start, period.period_end
    from public.workspace_spend_rules rule
    cross join lateral (select coalesce(rule.time_zone, v_workspace.time_zone) as time_zone) zone
    cross join lateral private.spend_rule_period(rule.period, zone.time_zone, p_now) period
    where rule.workspace_id = p_workspace_id
      and rule.enabled
      and rule.deleted_at is null
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
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
  ),
  valued as (
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
    from rules
  ),
  decided as (
    select valued.*, state.rule_id is not null as has_state, state.highest_percent_fired, state.amount_fired_at,
      crossed.highest as crossed_percent
    from valued
    left join public.workspace_spend_rule_state state
      on state.rule_id = valued.id and state.period_start = valued.period_start
    cross join lateral (
      select max(threshold) as highest
      from unnest(valued.threshold_percents) threshold
      where valued.metric = 'budget_percent'
        and valued.base_nanos > 0
        and valued.value_nanos * 100 >= threshold::numeric * valued.base_nanos
    ) crossed
  ),
  firing as (
    select decided.*,
      case when decided.metric = 'spend' then 'amount-' || decided.threshold_amount_nanos else decided.crossed_percent::text end as threshold_key,
      case decided.period when 'day' then 'today' when 'week' then 'this week' else 'this month' end as so_far,
      case decided.period when 'day' then 'daily' when 'week' then 'weekly' else 'monthly' end as adjective,
      to_char(decided.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as period_key
    from decided
    where (decided.metric = 'spend' and decided.amount_fired_at is null and decided.value_nanos >= decided.threshold_amount_nanos)
      or (decided.metric = 'budget_percent' and decided.crossed_percent > coalesce(decided.highest_percent_fired, 0))
  ),
  labelled as (
    select firing.*,
      coalesce(scope.label, firing.scope_id, v_workspace.name, 'Workspace') as scope_label,
      case firing.scope_type
        when 'workspace' then 'The workspace'
        when 'key' then 'API key ''' || coalesce(left(scope.label, 60), 'deleted key') || ''''
        when 'member' then coalesce(scope.label, 'A former member')
        when 'department' then 'Department ''' || coalesce(left(scope.label, 60), 'deleted department') || ''''
        when 'model' then coalesce(scope.label, firing.scope_id)
        else 'Provider ' || firing.scope_id
      end as subject,
      case firing.base_kind
        when 'workspace_budget' then 'the ' || firing.base_ref || ' budget'
        when 'key_limit' then 'the key''s ' || firing.base_ref || ' limit'
        else private.workspace_push_usd(firing.base_nanos)
      end as base_short,
      'The ' || case firing.period when 'day' then 'day' when 'week' then 'week' else 'month' end || ' resets '
        || to_char(firing.period_end at time zone firing.time_zone, 'Mon FMDD, HH24:MI') || ' ' || firing.time_zone || '.' as resets
    from firing
    left join lateral (
      select case firing.scope_type
        when 'workspace' then nullif(btrim(v_workspace.name), '')
        when 'key' then (select nullif(btrim(key.name), '') from public.keys key where key.id = firing.scope_key_id)
        when 'member' then (select nullif(btrim(member.email), '') from auth.users member where member.id = firing.scope_user_id)
        when 'department' then (
          select nullif(btrim(department.name), '') from public.workspace_departments department
          where department.id = firing.scope_department_id
        )
        when 'model' then (select nullif(btrim(model.name), '') from public.v2_models model where model.model_slug = firing.scope_id limit 1)
      end as label
    ) scope on true
  ),
  rendered as (
    select labelled.*,
      'spend_alert:' || labelled.id || ':' || labelled.period_key || ':' || labelled.threshold_key as dedupe_key,
      left(labelled.name, 100) || ': ' || case when labelled.metric = 'spend'
          then private.workspace_push_usd(labelled.threshold_amount_nanos) || ' reached'
          else labelled.crossed_percent || '% of ' || labelled.base_short || ' reached'
        end as title,
      labelled.subject || ' has spent ' || private.workspace_push_usd(labelled.value_nanos) || ' ' || labelled.so_far
        || case when labelled.metric = 'spend'
          then ', past the ' || private.workspace_push_usd(labelled.threshold_amount_nanos) || ' alert threshold. '
          else ': ' || to_char(floor(labelled.value_nanos * 100 / labelled.base_nanos), 'FM999,999,990') || '% of '
            || case labelled.base_kind
              when 'amount' then private.workspace_push_usd(labelled.base_nanos)
              else labelled.base_short || ' (' || private.workspace_push_usd(labelled.base_nanos) || ')'
            end
            || '. Alerts at ' || (select string_agg(threshold || '%', ', ' order by threshold) from unnest(labelled.threshold_percents) threshold) || '. '
        end
        || labelled.resets as message
    from labelled
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
        'period', jsonb_build_object(
          'kind', rendered.period,
          'start', rendered.period_start,
          'end', rendered.period_end,
          'time_zone', rendered.time_zone
        ),
        'value_nanos', rendered.value_nanos,
        'base_kind', rendered.base_kind,
        'base_ref', rendered.base_ref,
        'base_nanos', rendered.base_nanos,
        'percent', case when rendered.base_nanos > 0 then round(rendered.value_nanos * 100 / rendered.base_nanos, 1) end,
        'threshold_percent', rendered.crossed_percent,
        'threshold_percents', to_jsonb(rendered.threshold_percents),
        'thresholds_crossed', case when rendered.metric = 'budget_percent' then (
          select coalesce(jsonb_agg(threshold order by threshold), '[]'::jsonb)
          from unnest(rendered.threshold_percents) threshold
          where threshold <= rendered.crossed_percent and threshold > coalesce(rendered.highest_percent_fired, 0)
        ) end,
        'threshold_amount_nanos', rendered.threshold_amount_nanos,
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
    -- A fired rule records what it sent; a rule seen for the first time this period gets its
    -- rollover row. Rules already recorded this period that fire nothing are not written.
    insert into public.workspace_spend_rule_state as state (
      rule_id, workspace_id, period_start, period_end, highest_percent_fired, amount_fired_at, last_fired_at,
      fire_count, last_value_nanos, last_base_nanos, last_dedupe_key
    )
    select
      decided.id, p_workspace_id, decided.period_start, decided.period_end,
      case when rendered.id is not null then rendered.crossed_percent end,
      case when rendered.id is not null and decided.metric = 'spend' then p_now end,
      case when rendered.id is not null then p_now end,
      case when rendered.id is not null then 1 else 0 end,
      case when rendered.id is not null then round(decided.value_nanos)::bigint end,
      case when rendered.id is not null then decided.base_nanos end,
      rendered.dedupe_key
    from decided
    left join rendered on rendered.id = decided.id
    where rendered.id is not null or not decided.has_state
    on conflict (rule_id, period_start) do update set
      highest_percent_fired = greatest(state.highest_percent_fired, excluded.highest_percent_fired),
      amount_fired_at = coalesce(state.amount_fired_at, excluded.amount_fired_at),
      last_fired_at = coalesce(excluded.last_fired_at, state.last_fired_at),
      fire_count = state.fire_count + excluded.fire_count,
      last_value_nanos = coalesce(excluded.last_value_nanos, state.last_value_nanos),
      last_base_nanos = coalesce(excluded.last_base_nanos, state.last_base_nanos),
      last_dedupe_key = coalesce(excluded.last_dedupe_key, state.last_dedupe_key)
    returning 1
  )
  select jsonb_build_object(
    'rules', (select count(*) from rules),
    'fired', (select count(*) from queued),
    'state_rows', (select count(*) from saved),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', queued.id,
        'rule_id', queued.payload ->> 'rule_id',
        'dedupe_key', queued.dedupe_key,
        'threshold', coalesce(queued.payload -> 'threshold_percent', queued.payload -> 'threshold_amount_nanos')
      ) order by queued.dedupe_key)
      from queued
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

COMMENT ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone) IS 'Evaluates a workspace''s enabled spend and budget_percent rules over their calendar period at p_now and queues one spend_alert event per rule that crossed a new threshold (the highest one). Writes rule state only on fire or period rollover. Called by public.sweep_spend_rules.';

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.sweep_spend_rules (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit integer                  DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates spend rules (private.evaluate_workspace_spend_rules) for three sets of workspaces,
-- each up to p_limit, every workspace at most once per call:
--   1. dirty:    workspace_spend_rule_dirty rows, which process_v2_analytics_outbox writes when
--                it rebuilds a workspace's usage. They are claimed with SKIP LOCKED and deleted
--                as they are claimed, oldest first; a workspace marked again while this runs is
--                kept for the next call.
--   2. rollover: workspaces with an enabled rule that has no state row for its current period,
--                so a new day, week or month (in the rule's time zone) or a new rule is picked up
--                within one call, with or without traffic.
--   3. periodic: one twelfth of the workspaces with enabled rules, by a hash of the workspace id
--                and the 5-minute slot of p_now, so each is evaluated about once an hour when
--                called every 5 minutes. This catches changes no usage marks: a budget or key
--                limit lowered, a rule edited, rollup hours rebuilt late. A slot over p_limit
--                rotates hourly, so none of its workspaces is skipped for good.
-- Workspaces that no longer exist are skipped. One sweep runs at a time; a concurrent call
-- returns skipped_locked. Returns the counts and the events queued, plus "blocks": [] for
-- block changes (none yet: rules only notify).
declare
  v_slots constant integer := 12;
  v_slot integer;
  v_round bigint;
  v_dirty uuid[];
  v_rollover uuid[];
  v_periodic uuid[];
  v_workspace uuid;
  v_result jsonb;
  v_events jsonb := '[]'::jsonb;
  v_evaluated integer := 0;
  v_rules integer := 0;
  v_fired integer := 0;
  v_state_rows integer := 0;
begin
  if p_now is null then
    raise exception 'invalid_spend_rule_sweep_time';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_spend_rule_sweep_limit';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.sweep_spend_rules', 0)) then
    return jsonb_build_object('skipped_locked', true, 'dirty', 0, 'rollover', 0, 'periodic', 0, 'evaluated', 0,
      'rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb);
  end if;

  with claimed as (
    delete from public.workspace_spend_rule_dirty dirty
    where dirty.workspace_id in (
      select candidate.workspace_id
      from public.workspace_spend_rule_dirty candidate
      order by candidate.dirtied_at, candidate.workspace_id
      limit p_limit
      for update skip locked
    )
    returning dirty.workspace_id
  )
  select coalesce(array_agg(claimed.workspace_id), '{}') into v_dirty from claimed;

  select coalesce(array_agg(due.workspace_id), '{}') into v_rollover
  from (
    select distinct rule.workspace_id
    from public.workspace_spend_rules rule
    left join public.workspace_settings settings on settings.workspace_id = rule.workspace_id
    cross join lateral private.spend_rule_period(rule.period, coalesce(rule.time_zone, settings.billing_time_zone, 'UTC'), p_now) period
    where rule.enabled
      and rule.deleted_at is null
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
      and rule.workspace_id <> all (v_dirty)
      and not exists (
        select 1 from public.workspace_spend_rule_state state
        where state.rule_id = rule.id and state.period_start = period.period_start
      )
    order by rule.workspace_id
    limit p_limit
  ) due;

  v_slot := (floor(extract(epoch from p_now) / 300)::bigint % v_slots)::integer;
  -- A slot with more than p_limit workspaces starts p_limit further along each hour, so every
  -- workspace in it is reached within ceil(n / p_limit) hours instead of only the first p_limit.
  v_round := floor(extract(epoch from p_now) / 3600)::bigint;
  select coalesce(array_agg(due.workspace_id), '{}') into v_periodic
  from (
    select slot.workspace_id
    from (
      select candidate.workspace_id,
        pg_catalog.row_number() over (order by candidate.workspace_id) - 1 as position,
        pg_catalog.count(*) over () as total
      from (
        select distinct rule.workspace_id
        from public.workspace_spend_rules rule
        where rule.enabled
          and rule.deleted_at is null
          and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_slots + v_slots) % v_slots = v_slot
          and rule.workspace_id <> all (v_dirty)
          and rule.workspace_id <> all (v_rollover)
      ) candidate
    ) slot
    where ((slot.position - v_round * p_limit) % slot.total + slot.total) % slot.total < p_limit
  ) due;

  foreach v_workspace in array v_dirty || v_rollover || v_periodic loop
    v_result := private.evaluate_workspace_spend_rules(v_workspace, p_now);
    if coalesce((v_result ->> 'missing')::boolean, false) then
      continue;
    end if;
    v_evaluated := v_evaluated + 1;
    v_rules := v_rules + coalesce((v_result ->> 'rules')::integer, 0);
    v_fired := v_fired + coalesce((v_result ->> 'fired')::integer, 0);
    v_state_rows := v_state_rows + coalesce((v_result ->> 'state_rows')::integer, 0);
    if jsonb_array_length(v_result -> 'events') > 0 then
      v_events := v_events || (
        select jsonb_agg(event || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'events') event
      );
    end if;
  end loop;

  return jsonb_build_object(
    'dirty', cardinality(v_dirty),
    'rollover', cardinality(v_rollover),
    'periodic', cardinality(v_periodic),
    'evaluated', v_evaluated,
    'rules', v_rules,
    'fired', v_fired,
    'state_rows', v_state_rows,
    'events', v_events,
    'blocks', '[]'::jsonb
  );
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) IS 'Evaluates spend rules for dirty workspaces (claimed with SKIP LOCKED), workspaces whose rule periods rolled over, and an hourly slice of all workspaces with enabled rules. Notify only. Called every 5 minutes by the API scheduled job when SPEND_RULES_ENABLED is true.';

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.process_v2_analytics_outbox (
  p_limit integer DEFAULT 250
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 2000));
  v_selected integer := 0;
  v_coalesced integer := 0;
  v_private_grains integer := 0;
  v_public_daily_grains integer := 0;
  v_public_hourly_grains integer := 0;
  v_workspace_hours integer := 0;
  v_rollup_id uuid;
  grain record;
begin
  -- Different event batches can rebuild the same summary concurrently.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.process_v2_analytics_outbox', 0)) then
    return jsonb_build_object('selected', 0, 'coalesced', 0, 'private_grains', 0,
      'public_daily_grains', 0, 'public_hourly_grains', 0, 'workspace_hours', 0, 'skipped_locked', true);
  end if;
  create temporary table if not exists pg_temp.v2_rollup_batch (
    request_event_id uuid primary key,
    workspace_id uuid not null,
    occurred_at timestamptz not null,
    app_id uuid,
    model_slug text,
    provider_model_id text,
    cloudflare_colo text
  ) on commit drop;
  truncate table pg_temp.v2_rollup_batch;

  insert into pg_temp.v2_rollup_batch (
    request_event_id, workspace_id, occurred_at, app_id, model_slug,
    provider_model_id, cloudflare_colo
  )
  select
    outbox.request_event_id,
    fact.workspace_id,
    fact.occurred_at,
    fact.app_id,
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.provider_model_id,
    fact.cloudflare_colo
  from public.v2_analytics_outbox outbox
  join public.v2_request_facts fact on fact.request_event_id = outbox.request_event_id
  where outbox.status in ('pending', 'failed')
    and outbox.available_at <= now()
  order by outbox.occurred_at, outbox.request_event_id
  for update of outbox skip locked
  limit case when exists(select 1 from private.v2_analytics_previous_grains)
    then greatest(0,v_limit-least(5,v_limit)) else v_limit end;


  get diagnostics v_selected = row_count;
  create temporary table if not exists pg_temp.v2_previous_grain_batch
    (like private.v2_analytics_previous_grains including defaults) on commit drop;
  truncate table pg_temp.v2_previous_grain_batch;
  alter table pg_temp.v2_previous_grain_batch add column if not exists transaction_id bigint;
  insert into pg_temp.v2_previous_grain_batch(grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo,queued_at,transaction_id)
  select previous.* from private.v2_analytics_previous_grains previous
  order by previous.queued_at,previous.grain_id for update skip locked limit greatest(0,v_limit-v_selected);
  insert into pg_temp.v2_rollup_batch
    (request_event_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
  select grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo
  from pg_temp.v2_previous_grain_batch;
  v_selected := v_selected + (select count(*) from pg_temp.v2_previous_grain_batch);

  if v_selected = 0 then
    return jsonb_build_object(
      'selected', 0,
      'coalesced', 0,
      'private_grains', 0,
      'public_daily_grains', 0,
      'public_hourly_grains', 0,
      'workspace_hours', 0
    );
  end if;

  -- The full-grain rebuild also includes other ready events in these same
  -- workspace/hour identities. Lock them before reading sources: corrections
  -- then re-enqueue after this transaction, even when an existing pending
  -- outbox upsert would otherwise have been a no-op. Cap all acknowledgments
  -- at 2,000; do not enlarge the set of summaries that must be rebuilt.
  insert into pg_temp.v2_rollup_batch (
    request_event_id, workspace_id, occurred_at, app_id, model_slug,
    provider_model_id, cloudflare_colo
  )
  select outbox.request_event_id, fact.workspace_id, fact.occurred_at, fact.app_id,
    coalesce(fact.routed_model_slug, fact.requested_model_slug),
    fact.provider_model_id, fact.cloudflare_colo
  from public.v2_analytics_outbox outbox
  join public.v2_request_facts fact on fact.request_event_id = outbox.request_event_id
  where outbox.status in ('pending', 'failed') and outbox.available_at <= now()
    and outbox.occurred_at >= (select date_trunc('hour', min(occurred_at)) from pg_temp.v2_rollup_batch)
    and outbox.occurred_at < (select date_trunc('hour', max(occurred_at)) + interval '1 hour' from pg_temp.v2_rollup_batch)
    and not exists (select 1 from pg_temp.v2_rollup_batch batch where batch.request_event_id = outbox.request_event_id)
    and exists (
      select 1 from pg_temp.v2_rollup_batch batch
      where batch.model_slug is not null and batch.workspace_id = fact.workspace_id
        and date_trunc('hour', batch.occurred_at) = date_trunc('hour', fact.occurred_at)
        and batch.app_id is not distinct from fact.app_id
        and batch.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
        and batch.provider_model_id is not distinct from fact.provider_model_id
        and batch.cloudflare_colo is not distinct from fact.cloudflare_colo
    )
  order by outbox.occurred_at, outbox.request_event_id
  for update of outbox skip locked
  limit greatest(0, least(2000, v_limit * 8) - v_selected);
  get diagnostics v_coalesced = row_count;

  update public.v2_analytics_outbox outbox
  set status = 'processing', updated_at = now()
  where outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch);

  for grain in
    select distinct
      batch.workspace_id,
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_private_usage_daily rollup
    where rollup.workspace_id = grain.workspace_id
      and rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_private_usage_daily (
      usage_date, workspace_id, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.workspace_id, grain.app_id, grain.model_slug,
      grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.v2_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_private_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.v2_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.workspace_id = grain.workspace_id
      and fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_private_grains := v_private_grains + 1;
  end loop;

  -- The usage overview's 15-minute rollups are rebuilt a whole workspace hour at a
  -- time, so a correction that moves a request to another key or model within the
  -- hour is rebuilt too. v2_usage_overview_requests counts each request as the
  -- overview does; get_private_usage_overview reads requests outside the rollups
  -- from the same view. The 15-minute rollup also keeps each request's actor (key creator
  -- or OAuth user) apart for spend rules; the label rollup does not.
  for grain in
    select distinct batch.workspace_id, date_trunc('hour', batch.occurred_at, 'UTC') as bucket_start
    from pg_temp.v2_rollup_batch batch
  loop
    delete from public.v2_private_usage_15m rollup
    where rollup.workspace_id = grain.workspace_id
      and rollup.bucket_start >= grain.bucket_start
      and rollup.bucket_start < grain.bucket_start + interval '1 hour';
    delete from public.v2_private_usage_labels_15m rollup
    where rollup.workspace_id = grain.workspace_id
      and rollup.bucket_start >= grain.bucket_start
      and rollup.bucket_start < grain.bucket_start + interval '1 hour';

    -- Read each request's usage meters once for both rollups.
    with requests as materialized (
      select request.*, date_bin('15 minutes', request.occurred_at, grain.bucket_start) as bucket_start
      from private.v2_usage_overview_requests request
      where request.workspace_id = grain.workspace_id
        and request.occurred_at >= grain.bucket_start
        and request.occurred_at < grain.bucket_start + interval '1 hour'
    ), totals as (
      insert into public.v2_private_usage_15m (
        workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id,
        requests, successful_requests, guardrail_blocked, cost_nanos,
        tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
      )
      select
        grain.workspace_id, request.bucket_start, request.model_id, request.provider_model_id,
        request.key_id, request.app_id, request.byok, request.actor_user_id,
        count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
        sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
        sum(request.reasoning_tokens), sum(request.cached_tokens)
      from requests request
      group by 2, 3, 4, 5, 6, 7, 8
    )
    insert into public.v2_private_usage_labels_15m (
      workspace_id, bucket_start, label_key, label_value, model_id, provider_model_id, key_id, app_id, byok,
      requests, successful_requests, guardrail_blocked, cost_nanos,
      tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
    )
    select
      grain.workspace_id, request.bucket_start, label.label_key, label.label_value,
      request.model_id, request.provider_model_id, request.key_id, request.app_id, request.byok,
      count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
      sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
      sum(request.reasoning_tokens), sum(request.cached_tokens)
    from requests request
    cross join lateral (
      -- A request counts once per label, however often it repeats it.
      select distinct element.value ->> 'key' as label_key, element.value ->> 'value' as label_value
      from jsonb_array_elements(request.labels) element
      where jsonb_typeof(element.value -> 'key') = 'string' and jsonb_typeof(element.value -> 'value') = 'string'
    ) label
    group by 2, 3, 4, 5, 6, 7, 8, 9;

    v_workspace_hours := v_workspace_hours + 1;
  end loop;

  -- Spend rules: mark each rebuilt workspace that has an enabled rule, in one statement, for
  -- public.sweep_spend_rules. A row already there stays as it is.
  insert into public.workspace_spend_rule_dirty (workspace_id)
  select batch.workspace_id
  from (select distinct rollup_batch.workspace_id from pg_temp.v2_rollup_batch rollup_batch) batch
  where exists (
    select 1 from public.workspace_spend_rules rule
    where rule.workspace_id = batch.workspace_id and rule.enabled and rule.deleted_at is null
  )
  on conflict (workspace_id) do nothing;

  for grain in
    select distinct
      batch.occurred_at::date as usage_date,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_daily rollup
    where rollup.usage_date = grain.usage_date
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_daily (
      usage_date, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.usage_date, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.reporting_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_daily_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.reporting_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.usage_date::timestamptz
      and fact.occurred_at < (grain.usage_date + 1)::timestamptz
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_daily_grains := v_public_daily_grains + 1;
  end loop;

  for grain in
    select distinct
      date_trunc('hour', batch.occurred_at) as bucket_start,
      batch.app_id,
      batch.model_slug,
      batch.provider_model_id,
      batch.cloudflare_colo
    from pg_temp.v2_rollup_batch batch
    where batch.model_slug is not null
  loop
    delete from public.v2_public_usage_hourly rollup
    where rollup.bucket_start = grain.bucket_start
      and rollup.app_id is not distinct from grain.app_id
      and rollup.model_slug = grain.model_slug
      and rollup.provider_model_id is not distinct from grain.provider_model_id
      and rollup.cloudflare_colo is not distinct from grain.cloudflare_colo;

    insert into public.v2_public_usage_hourly (
      bucket_start, app_id, model_slug, provider_model_id, cloudflare_colo,
      requests, successful_requests, failed_requests, rate_limited_requests,
      tool_call_count, tool_call_requests, tool_call_successes,
      structured_output_attempts, structured_output_successes,
      latency_sum_ms, latency_count, generation_sum_ms, generation_count,
      throughput_sum, throughput_count, gateway_total_sum_ms, gateway_total_count,
      internal_dispatch_sum_ms, internal_dispatch_count,
      upstream_attempts, failed_upstream_attempts, cached_input_tokens, input_tokens, cost_nanos
    )
    select
      grain.bucket_start, grain.app_id, grain.model_slug, grain.provider_model_id, grain.cloudflare_colo,
      count(*), count(*) filter (where fact.success), count(*) filter (where not fact.success),
      count(*) filter (where fact.status_code = 429),
      coalesce(sum(fact.tool_call_count), 0),
      count(*) filter (where fact.tool_call_count > 0),
      count(*) filter (where fact.tool_call_count > 0 and fact.tool_call_succeeded is true),
      count(*) filter (where fact.structured_output_attempted),
      count(*) filter (where fact.structured_output_attempted and fact.structured_output_succeeded),
      coalesce(sum(fact.latency_ms), 0), count(fact.latency_ms),
      coalesce(sum(fact.generation_ms), 0), count(fact.generation_ms),
      coalesce(sum(fact.throughput), 0), count(fact.throughput),
      coalesce(sum(fact.gateway_total_ms), 0), count(fact.gateway_total_ms),
      coalesce(sum(fact.internal_dispatch_ms), 0), count(fact.internal_dispatch_ms),
      coalesce(sum(attempts.attempts), 0), coalesce(sum(attempts.failed_attempts), 0),
      coalesce(sum(usage.cached_input_tokens), 0), coalesce(sum(usage.input_tokens), 0),
      coalesce(sum(fact.cost_nanos), 0)
    from public.reporting_request_facts fact
    left join lateral (
      select count(*)::bigint as attempts,
        count(*) filter (where not attempt.success)::bigint as failed_attempts
      from public.v2_request_attempts attempt
      where attempt.request_event_id = fact.request_event_id
    ) attempts on true
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'cached_input_tokens'), 0) as cached_input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0) as input_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    having count(*) > 0
    returning rollup_id into v_rollup_id;

    insert into public.v2_public_usage_hourly_meters (
      rollup_id, meter_key, modality, unit, quantity
    )
    select v_rollup_id, meter.meter_key, meter.modality, meter.unit, sum(meter.quantity)
    from public.v2_request_usage meter
    join public.reporting_request_facts fact on fact.request_event_id = meter.request_event_id
    where fact.occurred_at >= grain.bucket_start
      and fact.occurred_at < grain.bucket_start + interval '1 hour'
      and fact.app_id is not distinct from grain.app_id
      and coalesce(fact.routed_model_slug, fact.requested_model_slug) = grain.model_slug
      and fact.provider_model_id is not distinct from grain.provider_model_id
      and fact.cloudflare_colo is not distinct from grain.cloudflare_colo
    group by meter.meter_key, meter.modality, meter.unit;

    v_public_hourly_grains := v_public_hourly_grains + 1;
  end loop;

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'private_daily', date_trunc('day', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('day', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  insert into public.v2_rollup_refresh_state (
    rollup_name, bucket_start, last_started_at, last_completed_at, source_watermark, status, error_message, updated_at
  )
  select 'public_hourly', date_trunc('hour', batch.occurred_at), now(), now(), max(batch.occurred_at), 'complete', null, now()
  from pg_temp.v2_rollup_batch batch
  group by date_trunc('hour', batch.occurred_at)
  on conflict (rollup_name, bucket_start) do update set
    last_started_at = excluded.last_started_at,
    last_completed_at = excluded.last_completed_at,
    source_watermark = excluded.source_watermark,
    status = excluded.status,
    error_message = null,
    updated_at = now();

  update public.v2_analytics_outbox outbox
  set status = 'complete', last_error = null, updated_at = now()
  where outbox.status = 'processing'
    and outbox.request_event_id in (select batch.request_event_id from pg_temp.v2_rollup_batch batch);


  delete from private.v2_analytics_previous_grains
  where grain_id in (select grain_id from pg_temp.v2_previous_grain_batch);
  return jsonb_build_object(
    'selected', v_selected,
    'coalesced', v_coalesced,
    'private_grains', v_private_grains,
    'public_daily_grains', v_public_daily_grains,
    'public_hourly_grains', v_public_hourly_grains,
    'workspace_hours', v_workspace_hours
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."process_v2_analytics_outbox"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."process_v2_analytics_outbox"(integer) IS 'Serializes summary rebuilds, claims a bounded seed batch, and coalesces covered workspace/hour events before idempotent private daily, public daily, public hourly, and usage overview 15-minute rebuilds; the 15-minute and label rollups are rebuilt per touched workspace hour, and rebuilt workspaces with enabled spend rules are marked in workspace_spend_rule_dirty. At most 2000 acknowledgments per run; corrections retain row locks and re-enqueue after commit.';

REVOKE ALL ON FUNCTION "public"."process_v2_analytics_outbox"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_v2_analytics_outbox"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."process_v2_analytics_outbox"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enqueue_notification_event_deliveries (
  p_event_id                 uuid,
  p_workspace_id             uuid,
  p_event_kind               text,
  p_requested_destination_id uuid DEFAULT NULL::uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  claimed_event_id uuid;
  inserted_count integer := 0;
  spend_rule_id uuid;
begin
  insert into public.notification_routed_events (event_id, workspace_id)
  values (p_event_id, p_workspace_id)
  on conflict (event_id) do nothing
  returning event_id into claimed_event_id;

  if claimed_event_id is null then
    return 0;
  end if;

  if p_event_kind = 'notification_test' and p_requested_destination_id is not null then
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, destination.id, p_workspace_id, 'pending'
    from public.notification_destinations destination
    where destination.id = p_requested_destination_id
      and destination.workspace_id = p_workspace_id
      and destination.status = 'active'
    on conflict (event_id, destination_id) do nothing;
    get diagnostics inserted_count = row_count;
    return inserted_count;
  end if;

  -- A spend rule with destinations of its own sends there instead of the workspace's routes for
  -- the kind (active destinations only); a rule without any uses the routes.
  if p_event_kind in ('spend_alert', 'spend_blocked') then
    select rule.id into spend_rule_id
    from public.email_outbox event
    join public.workspace_spend_rules rule
      on rule.workspace_id = p_workspace_id
      and rule.id = case when event.payload ->> 'rule_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (event.payload ->> 'rule_id')::uuid end
    where event.id = p_event_id
      and exists (
        select 1 from public.workspace_spend_rule_destinations rule_destination
        where rule_destination.rule_id = rule.id and rule_destination.workspace_id = p_workspace_id
      );
  end if;

  if spend_rule_id is not null then
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, rule_destination.destination_id, p_workspace_id, 'pending'
    from public.workspace_spend_rule_destinations rule_destination
    join public.notification_destinations destination on destination.id = rule_destination.destination_id
    where rule_destination.rule_id = spend_rule_id
      and rule_destination.workspace_id = p_workspace_id
      and destination.status = 'active'
    on conflict (event_id, destination_id) do nothing;
  else
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, route.destination_id, p_workspace_id, 'pending'
    from public.notification_event_destinations route
    join public.notification_destinations destination on destination.id = route.destination_id
    where route.workspace_id = p_workspace_id
      and route.event_kind = p_event_kind
      and destination.status = 'active'
    on conflict (event_id, destination_id) do nothing;
  end if;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.capture_workspace_notification_events (
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Turns new workspace events into push events (workspace_notification_events), one per dedupe key:
--   email_outbox            auto_top_up_failed, payment_method_expiring and spend_alert (money;
--                           a spend alert also reaches the scoped key's creator, or the member
--                           of a member rule, through key_created_by),
--                           model_deprecation (deprecations), model_substitution and
--                           rate_limit_throttled (traffic), and security_leaked_key (security; one
--                           per exposed key, though the email has a row per recipient, with the
--                           API or management key's creator as a recipient)
--   workspace_audit_events  api_key.created, .rotated, .deleted, .paused and .resumed (security),
--                           except for the web chat's managed key
-- Each source is read from its cursor, in (created_at, id) order, up to p_limit rows per source:
--   * normally from ten minutes before the previous complete read up to the start of this call,
--     so a row whose transaction commits a little late is still read, and reading the overlap
--     again adds nothing;
--   * after a read cut short by p_limit, from just after its last row (a keyset position), so
--     each call moves on even when the overlap alone holds more than p_limit rows.
-- Nothing older than two days is read, and the first call only sets the cursors.
-- Low balance emails are not read: sweep_low_balance_pushes pushes low balance once per drop
-- whatever the email setting, so an email row is never a second push. The email is unchanged.
declare
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now timestamptz := now();
  v_cursor public.workspace_notification_cursors%rowtype;
  v_from timestamptz;
  v_from_id uuid;
  v_last timestamptz;
  v_last_id uuid;
  v_read integer;
  v_row record;
  v_inserted integer;
  v_captured integer := 0;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'invalid_workspace_notification_capture_limit';
  end if;

  select c.* into v_cursor from public.workspace_notification_cursors c where c.source = 'email_outbox' for update;
  if v_cursor.source is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('email_outbox', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    v_from := coalesce(v_cursor.resume_created_at, v_cursor.read_until - interval '10 minutes');
    v_from_id := coalesce(v_cursor.resume_id, '00000000-0000-0000-0000-000000000000'::uuid);
    for v_row in
      select o.id, o.created_at, o.kind, o.workspace_id, o.payload
      from public.email_outbox o
      where (o.created_at, o.id) > (v_from, v_from_id)
        and o.created_at > v_now - interval '2 days'
        and o.created_at <= v_now
        and o.kind in ('auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution',
          'rate_limit_throttled', 'security_leaked_key', 'spend_alert')
        and o.workspace_id is not null
      order by o.created_at, o.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;
      v_last_id := v_row.id;

      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
      select
        v_row.workspace_id,
        v_row.kind,
        case
          when v_row.kind in ('auto_top_up_failed', 'payment_method_expiring', 'spend_alert') then 'money'
          when v_row.kind = 'model_deprecation' then 'deprecations'
          when v_row.kind = 'security_leaked_key' then 'security'
          else 'traffic'
        end,
        case
          when v_row.kind = 'security_leaked_key' then 'security_leaked_key:' || v_row.workspace_id || ':'
            || coalesce(v_row.payload ->> 'key_id', v_row.payload ->> 'key_preview', v_row.payload ->> 'key_name', '') || ':' || extract(epoch from v_row.created_at)
          else 'email_outbox:' || v_row.id
        end,
        coalesce(k.id, mk.id),
        coalesce(k.created_by, mk.created_by,
          case when v_row.kind = 'spend_alert' and v_row.payload #>> '{scope,type}' = 'member' and v_row.payload #>> '{scope,user_id}' ~* v_uuid
            then (v_row.payload #>> '{scope,user_id}')::uuid end),
        v_row.payload - 'user_first_name',
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on k.workspace_id = v_row.workspace_id
        and ((v_row.kind = 'security_leaked_key' and coalesce(v_row.payload ->> 'key_type', 'api_key') = 'api_key'
            and k.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end)
          or (v_row.kind = 'spend_alert' and v_row.payload #>> '{scope,type}' = 'key'
            and k.id = case when v_row.payload #>> '{scope,key_id}' ~* v_uuid then (v_row.payload #>> '{scope,key_id}')::uuid end))
      left join public.management_keys mk
        on v_row.kind = 'security_leaked_key' and v_row.payload ->> 'key_type' = 'management_key'
        and mk.workspace_id = v_row.workspace_id
        and mk.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end
      on conflict (dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
      v_captured := v_captured + v_inserted;
    end loop;

    -- A full page leaves a keyset position to carry on from; a short one completes the read.
    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else read_until end,
        resume_created_at = case when v_read < p_limit then null else v_last end,
        resume_id = case when v_read < p_limit then null else v_last_id end,
        updated_at = v_now
    where source = 'email_outbox';
  end if;

  select c.* into v_cursor from public.workspace_notification_cursors c where c.source = 'workspace_audit_events' for update;
  if v_cursor.source is null then
    insert into public.workspace_notification_cursors (source, read_until) values ('workspace_audit_events', v_now) on conflict (source) do nothing;
  else
    v_read := 0;
    v_from := coalesce(v_cursor.resume_created_at, v_cursor.read_until - interval '10 minutes');
    v_from_id := coalesce(v_cursor.resume_id, '00000000-0000-0000-0000-000000000000'::uuid);
    for v_row in
      select a.id, a.created_at, a.workspace_id, a.actor_user_id, a.action, a.target_id, a.target_name, a.metadata
      from public.workspace_audit_events a
      where a.target_type = 'api_key'
        and (a.created_at, a.id) > (v_from, v_from_id)
        and a.created_at > v_now - interval '2 days'
        and a.created_at <= v_now
        and a.action in ('api_key.created', 'api_key.rotated', 'api_key.deleted', 'api_key.paused', 'api_key.resumed')
      order by a.created_at, a.id
      limit p_limit
    loop
      v_read := v_read + 1;
      v_last := v_row.created_at;
      v_last_id := v_row.id;

      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, actor_user_id, key_id, key_created_by, payload, occurred_at)
      select
        v_row.workspace_id,
        replace(v_row.action, '.', '_'),
        'security',
        'workspace_audit_events:' || v_row.id,
        v_row.actor_user_id,
        coalesce(k.id, case when v_row.target_id ~* v_uuid then v_row.target_id::uuid end),
        k.created_by,
        jsonb_strip_nulls(jsonb_build_object(
          'key_name', coalesce(nullif(btrim(v_row.target_name), ''), k.name),
          'actor_name', (
            select left(coalesce(nullif(btrim(u.display_name), ''), nullif(btrim(au.raw_user_meta_data ->> 'full_name'), ''),
              nullif(btrim(au.raw_user_meta_data ->> 'name'), ''), nullif(split_part(au.email, '@', 1), '')), 40)
            from auth.users au
            left join public.users u on u.user_id = au.id
            where au.id = v_row.actor_user_id
          ),
          'app_name', v_row.metadata ->> 'appName',
          'replacement_key_name', coalesce(v_row.metadata ->> 'replacementKeyName', v_row.metadata ->> 'replacement_key_name'),
          'previous_key_expires_at', coalesce(v_row.metadata ->> 'previousKeyExpiresAt', v_row.metadata ->> 'previous_key_expires_at')
        )),
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on k.workspace_id = v_row.workspace_id
        and k.id = case when v_row.target_id ~* v_uuid then v_row.target_id::uuid end
      where coalesce(k.name, v_row.target_name, '') <> '__chat_route_managed_key__'
      on conflict (dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
      v_captured := v_captured + v_inserted;
    end loop;

    -- A full page leaves a keyset position to carry on from; a short one completes the read.
    update public.workspace_notification_cursors
    set read_until = case when v_read < p_limit then v_now else read_until end,
        resume_created_at = case when v_read < p_limit then null else v_last end,
        resume_id = case when v_read < p_limit then null else v_last_id end,
        updated_at = v_now
    where source = 'workspace_audit_events';
  end if;

  return jsonb_build_object('captured', v_captured);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."capture_workspace_notification_events"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."capture_workspace_notification_events"(integer) TO "postgres";
