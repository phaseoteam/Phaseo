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
