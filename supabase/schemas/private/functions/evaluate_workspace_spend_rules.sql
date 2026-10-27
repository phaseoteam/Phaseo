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
--     the workspace dirty again. Values come from private.spend_rule_values and the text from
--     private.spend_rule_alert_text, which the API preview and test sends share.
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

  with valued as materialized (
    -- Spend so far and the base of every enabled, evaluable rule (shared with the API preview).
    select * from private.spend_rule_values(p_workspace_id, p_now)
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
      to_char(decided.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as period_key
    from decided
    where (decided.metric = 'spend' and decided.amount_fired_at is null and decided.value_nanos >= decided.threshold_amount_nanos)
      or (decided.metric = 'budget_percent' and decided.crossed_percent > coalesce(decided.highest_percent_fired, 0))
  ),
  rendered as (
    select firing.*, alert.scope_label, alert.title, alert.message,
      'spend_alert:' || firing.id || ':' || firing.period_key || ':' || firing.threshold_key as dedupe_key
    from firing
    cross join lateral private.spend_rule_alert_text(
      v_workspace.name, firing.name, firing.metric, firing.scope_type, firing.scope_id, firing.scope_key_id,
      firing.scope_user_id, firing.scope_department_id, firing.period, firing.period_end, firing.time_zone,
      firing.base_kind, firing.base_ref, firing.base_nanos, firing.threshold_percents, firing.threshold_amount_nanos,
      firing.value_nanos, firing.crossed_percent
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
    'rules', (select count(*) from valued),
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
