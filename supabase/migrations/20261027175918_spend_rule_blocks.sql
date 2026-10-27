-- phaseo:allow-destructive-migration reason: the two DROP FUNCTION statements replace private.evaluate_workspace_spend_rules and public.sweep_spend_rules with versions that take a p_blocks argument (same name, one more defaulted parameter; the sweep is the only caller of the evaluator and is re-created below). capture_workspace_notification_events is re-created unchanged apart from reading spend_blocked rows. No data is deleted.

-- Spend rule blocks (PR 8 of the spend rules stack): grace-margin blocking.
-- * private.evaluate_workspace_spend_rules(p_workspace_id, p_now, p_blocks): starts a block when a
--   block rule's spend reaches its block point (block_at_amount_nanos, or block_at_percent of the
--   base), only when p_blocks is true and p_now is current, never again in a period an admin
--   lifted it by hand; lifts blocks on period reset, below the limit, or a deleted, disabled or
--   changed rule. Each start and lift queues a spend_blocked event (private.queue_spend_block_event).
-- * public.sweep_spend_rules(p_now, p_limit, p_blocks): passes p_blocks through, returns the block
--   changes and the workspaces whose gateway entry to republish, and picks up workspaces whose
--   blocks reached their reset.
-- * Trigger workspace_spend_rules_lift_blocks(_on_delete) (public.lift_spend_blocks_on_rule_change):
--   lifts a rule's block in the same transaction when the rule is deleted, disabled or changed.
-- * public.get_workspace_spend_block_entry (the gateway's KV entry), public.list_workspace_spend_blocks,
--   public.lift_workspace_spend_block (manual lift), public.list_spend_block_workspaces (reconcile).
-- * private.capture_workspace_notification_events: spend_blocked events become money pushes.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

DROP FUNCTION IF EXISTS public.sweep_spend_rules(timestamp with time zone, integer);

DROP FUNCTION IF EXISTS private.evaluate_workspace_spend_rules(uuid, timestamp with time zone);

CREATE OR REPLACE FUNCTION private.spend_scope_label (
  p_workspace_id uuid,
  p_scope_type   text,
  p_scope_id     text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- What a spend block's scope is called right now: the workspace, key or department name, the
  -- member's email, the model's name, or the id itself when it has no name (a provider, or a
  -- key, member, department or model that no longer exists).
  select coalesce(case p_scope_type
    when 'workspace' then (select nullif(btrim(workspace.name), '') from public.workspaces workspace where workspace.id = p_workspace_id)
    when 'key' then (
      select nullif(btrim(key.name), '') from public.keys key
      where key.workspace_id = p_workspace_id and key.id::text = lower(p_scope_id)
    )
    when 'member' then (select nullif(btrim(member.email), '') from auth.users member where member.id::text = lower(p_scope_id))
    when 'department' then (
      select nullif(btrim(department.name), '') from public.workspace_departments department
      where department.workspace_id = p_workspace_id and department.id::text = lower(p_scope_id)
    )
    when 'model' then (select nullif(btrim(model.name), '') from public.v2_models model where model.model_slug = p_scope_id limit 1)
  end, p_scope_id, 'Workspace');
$function$;

COMMENT ON FUNCTION "private"."spend_scope_label"(uuid, text, text) IS 'Display name of a spend rule or block scope (workspace, key or department name, member email, model name, else the id). Used by the spend block event text and lists.';

REVOKE ALL ON FUNCTION "private"."spend_scope_label"(uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_scope_label"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_label"(uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_label"(uuid, text, text) TO "service_role";

CREATE OR REPLACE FUNCTION private.queue_spend_block_event (
  p_block_id uuid,
  p_state    text,
  p_now      timestamp with time zone
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Queues the spend_blocked event for a block that started (p_state 'started') or was lifted
-- ('lifted'): one email_outbox row deduped by spend_blocked:<block id>:<state>, so calling it twice
-- queues one event. Like spend_alert, the routed delivery job sends it to the rule's own
-- destinations or the workspace's spend_blocked routes, and the mobile push job sends it as a
-- money push (private.capture_workspace_notification_events). The rule id is in the payload, so
-- the event shows in the rule's history.
-- Returns the event id, or null when nothing was queued (no such block, a lift event for a block
-- that is still active, the workspace is being deleted, or the event already exists).
declare
  v_block record;
  v_label text;
  v_subject text;
  v_where text;
  v_so_far text;
  v_resets text;
  v_title text;
  v_message text;
  v_id uuid;
begin
  if p_block_id is null or p_state is null or p_state not in ('started', 'lifted') then
    raise exception 'invalid_spend_block_event';
  end if;

  select block.*, rule.name as rule_name, rule.period, rule.metric, workspace.name as workspace_name,
    workspace.owner_user_id, owner.email as owner_email, actor.email as lifted_by_email,
    coalesce(rule.time_zone, settings.billing_time_zone, 'UTC') as time_zone,
    case when block.scope_type = 'key' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_key_id,
    case when block.scope_type = 'member' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_user_id,
    case when block.scope_type = 'department' and block.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then block.scope_id::uuid end as scope_department_id
    into v_block
  from public.workspace_spend_blocks block
  join public.workspaces workspace on workspace.id = block.workspace_id
  left join public.workspace_spend_rules rule on rule.id = block.rule_id
  left join public.workspace_settings settings on settings.workspace_id = block.workspace_id
  left join auth.users owner on owner.id = workspace.owner_user_id
  left join auth.users actor on actor.id = block.lifted_by
  where block.id = p_block_id;
  if not found or (p_state = 'lifted' and v_block.lifted_at is null) then
    return null;
  end if;

  v_label := private.spend_scope_label(v_block.workspace_id, v_block.scope_type, v_block.scope_id);
  v_subject := case v_block.scope_type
    when 'workspace' then 'The workspace'
    when 'key' then 'API key ''' || left(v_label, 60) || ''''
    when 'member' then v_label
    when 'department' then 'Department ''' || left(v_label, 60) || ''''
    when 'model' then v_label
    else 'Provider ' || v_block.scope_id
  end;
  v_where := case v_block.scope_type
    when 'workspace' then 'in this workspace'
    when 'key' then 'with this key'
    when 'member' then 'by this member (their keys and OAuth apps)'
    when 'department' then 'by this department'
    when 'model' then 'to this model'
    else 'routed to this provider'
  end;
  v_so_far := case v_block.period when 'day' then 'today' when 'week' then 'this week' when 'month' then 'this month' else 'this period' end;
  v_resets := case when v_block.resets_at is not null
    then to_char(v_block.resets_at at time zone v_block.time_zone, 'Mon FMDD, HH24:MI') || ' ' || v_block.time_zone end;

  if p_state = 'started' then
    v_title := 'Requests blocked: ' || left(coalesce(v_block.rule_name, 'spend rule'), 100);
    v_message := v_subject || ' has spent ' || private.workspace_push_usd(v_block.spend_nanos) || ' ' || v_so_far
      || ', past the ' || private.workspace_push_usd(v_block.limit_nanos) || ' block limit of '
      || coalesce('"' || left(v_block.rule_name, 100) || '"', 'a spend rule') || '. New requests ' || v_where
      || case when v_block.block_free_models then '' else ' to paid models' end
      || ' get a 429 until ' || coalesce(v_resets, 'spend falls below the limit')
      || ', or until an owner or admin lifts the block. Blocks start within minutes of the limit, so spend can pass it a little.';
  else
    v_title := 'Spend block lifted: ' || left(coalesce(v_block.rule_name, 'spend rule'), 100);
    v_message := v_subject || ' can send requests again. '
      || case v_block.lift_reason
        when 'manual' then coalesce(v_block.lifted_by_email, 'An owner or admin') || ' lifted the block; it stays lifted until the period resets.'
        when 'period_reset' then 'The ' || case v_block.period when 'day' then 'day' when 'week' then 'week' when 'month' then 'month' else 'period' end || ' reset.'
        when 'below_limit' then 'Spend is below the block limit again.'
        when 'rule_changed' then 'The rule changed and spend is no longer past its block limit.'
        when 'rule_disabled' then 'The rule was turned off.'
        else 'The rule was deleted.'
      end;
  end if;

  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
  values (
    'spend_blocked',
    'spend_blocked',
    coalesce(v_block.owner_email, ''),
    v_title,
    v_block.workspace_id,
    v_block.owner_user_id,
    jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'workspace_name', v_block.workspace_name,
      'state', p_state,
      'block_id', v_block.id,
      'rule_id', v_block.rule_id,
      'rule_name', v_block.rule_name,
      'metric', v_block.metric,
      'action', 'block',
      'scope', jsonb_strip_nulls(jsonb_build_object(
        'type', v_block.scope_type,
        'id', v_block.scope_id,
        'label', v_label,
        'key_id', v_block.scope_key_id,
        'user_id', v_block.scope_user_id,
        'department_id', v_block.scope_department_id
      )),
      'period', jsonb_build_object(
        'kind', v_block.period,
        'start', v_block.period_start,
        'end', v_block.resets_at,
        'time_zone', v_block.time_zone
      ),
      'resets_at', v_block.resets_at,
      'value_nanos', v_block.spend_nanos,
      'limit_nanos', v_block.limit_nanos,
      'block_free_models', v_block.block_free_models,
      'started_at', v_block.started_at,
      'lifted_at', v_block.lifted_at,
      'lift_reason', v_block.lift_reason,
      'lifted_by', v_block.lifted_by,
      'evaluated_at', p_now,
      'url', 'https://phaseo.app/settings/notifications#spend-alerts',
      'push', jsonb_build_object(
        'title', left(v_title, 120),
        'body', left(v_message, 240),
        'href', '/settings/notifications',
        'lowerLead', false
      )
    ),
    'spend_blocked:' || v_block.id || ':' || p_state
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) IS 'Queues the spend_blocked event (payload.state started or lifted) for a spend block, deduped per block and state. Called by the evaluator, the lift function and the rule-change trigger.';

REVOKE ALL ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."queue_spend_block_event"(uuid, text, timestamp with time zone) TO "service_role";

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
--   * Blocks (grace margin): a block rule's block point is block_at_amount_nanos (spend rules) or
--     block_at_percent of the base (budget_percent rules). Once spend this period reaches it, a
--     workspace_spend_blocks row starts, unless the rule already has an active block or an
--     admin lifted one manually this period (a manual lift holds until the period resets).
--     Blocks start only when p_blocks is true (SPEND_RULE_BLOCKS_ENABLED) and p_now is within
--     15 minutes of the database clock, so a late or replayed evaluation never starts one; a
--     failed evaluation rolls back. Active blocks are lifted, whatever p_blocks says, when the
--     period resets (period_reset), spend is below the block point again, for example because
--     the budget was raised (below_limit, or rule_changed when the rule was edited since the
--     block started), or the rule was deleted, disabled or no longer blocks (rule_deleted,
--     rule_disabled, rule_changed; the rule-change trigger usually lifts these first). An active
--     block whose rule stopped or started covering free models takes the rule's setting.
--     Each start and lift queues a spend_blocked event (private.queue_spend_block_event).
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
    ), '[]'::jsonb),
    -- The block point and spend of each block rule, for the block statements below.
    'block_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rule_id', valued.id,
        'period_start', valued.period_start,
        'period_end', valued.period_end,
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

  v_block_rules := v_result -> 'block_rules';
  v_result := v_result - 'block_rules';

  -- Lift active blocks that no longer apply. Lifts come before starts: a rule's new block cannot
  -- start while its old one is still active (one active block per rule).
  for v_block in
    with block_rule as (
      select * from jsonb_to_recordset(v_block_rules) as x(
        rule_id uuid, period_start timestamptz, period_end timestamptz, value_nanos numeric, limit_nanos bigint,
        scope_type text, scope_id text, block_free_models boolean)
    ),
    decided as (
      select block.id, case
          when block.rule_id is null or rule.id is null or rule.deleted_at is not null then 'rule_deleted'
          when not rule.enabled then 'rule_disabled'
          when rule.action <> 'block' or block_rule.rule_id is null then 'rule_changed'
          when block.period_start <> block_rule.period_start then
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
        rule_id uuid, period_start timestamptz, period_end timestamptz, value_nanos numeric, limit_nanos bigint,
        scope_type text, scope_id text, block_free_models boolean)
      where block_rule.limit_nanos > 0
        and block_rule.value_nanos >= block_rule.limit_nanos
        and p_now < block_rule.period_end
        and not exists (
          select 1 from public.workspace_spend_blocks active
          where active.rule_id = block_rule.rule_id and active.lifted_at is null
        )
        and not exists (
          select 1 from public.workspace_spend_blocks lifted
          where lifted.rule_id = block_rule.rule_id
            and lifted.period_start = block_rule.period_start
            and lifted.lift_reason = 'manual'
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

COMMENT ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) IS 'Evaluates a workspace''s enabled spend and budget_percent rules over their calendar period at p_now: queues one spend_alert event per rule that crossed a new threshold (the highest one), lifts blocks that no longer apply and, when p_blocks is true and p_now is current, starts blocks for block rules past their block point. Writes rule state only on fire or period rollover. Called by public.sweep_spend_rules.';

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.sweep_spend_rules (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit  integer                  DEFAULT 100,
  p_blocks boolean                  DEFAULT false
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
--                within one call, with or without traffic, and workspaces with an active block
--                past its reset, so the block lifts on time.
--   3. periodic: one twelfth of the workspaces with enabled rules, by a hash of the workspace id
--                and the 5-minute slot of p_now, so each is evaluated about once an hour when
--                called every 5 minutes. This catches changes no usage marks: a budget or key
--                limit lowered, a rule edited, rollup hours rebuilt late. A slot over p_limit
--                rotates hourly, so none of its workspaces is skipped for good.
-- Workspaces that no longer exist are skipped. One sweep runs at a time; a concurrent call
-- returns skipped_locked. p_blocks (SPEND_RULE_BLOCKS_ENABLED) lets block rules start blocks;
-- blocks are lifted either way. Returns the counts, the events queued, the block changes
-- ("blocks": [{workspace_id, block_id, rule_id, state, reason, event_id}]) and "publish": the
-- evaluated workspaces with block rules or blocks, whose gateway entry the job republishes.
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
  v_blocks jsonb := '[]'::jsonb;
  v_publish uuid[] := '{}';
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
      'rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb, 'publish', '[]'::jsonb);
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
    select rule.workspace_id
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
    union
    -- workspace_spend_blocks_workspace_active_idx
    select block.workspace_id
    from public.workspace_spend_blocks block
    where block.lifted_at is null
      and block.resets_at <= p_now
      and block.workspace_id <> all (v_dirty)
    order by 1
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
    v_result := private.evaluate_workspace_spend_rules(v_workspace, p_now, coalesce(p_blocks, false));
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
    if jsonb_array_length(coalesce(v_result -> 'blocks', '[]'::jsonb)) > 0 then
      v_blocks := v_blocks || (
        select jsonb_agg(block || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'blocks') block
      );
    end if;
    if coalesce((v_result ->> 'block_scope')::boolean, false) then
      v_publish := v_publish || v_workspace;
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
    'blocks', v_blocks,
    'publish', to_jsonb(v_publish)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) IS 'Evaluates spend rules for dirty workspaces (claimed with SKIP LOCKED), workspaces whose rule periods rolled over or whose blocks reached their reset, and an hourly slice of all workspaces with enabled rules. Queues alerts, lifts blocks and, with p_blocks, starts them. Called every 5 minutes by the API scheduled job when SPEND_RULES_ENABLED is true (p_blocks = SPEND_RULE_BLOCKS_ENABLED).';

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.capture_workspace_notification_events (
  p_limit integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Turns new workspace events into push events (workspace_notification_events), one per dedupe key:
--   email_outbox            auto_top_up_failed, payment_method_expiring, spend_alert and
--                           spend_blocked (money; a spend alert or block also reaches the scoped
--                           key's creator, or the member of a member rule, through key_created_by),
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
          'rate_limit_throttled', 'security_leaked_key', 'spend_alert', 'spend_blocked')
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
          when v_row.kind in ('auto_top_up_failed', 'payment_method_expiring', 'spend_alert', 'spend_blocked') then 'money'
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
          case when v_row.kind in ('spend_alert', 'spend_blocked') and v_row.payload #>> '{scope,type}' = 'member' and v_row.payload #>> '{scope,user_id}' ~* v_uuid
            then (v_row.payload #>> '{scope,user_id}')::uuid end),
        v_row.payload - 'user_first_name',
        v_row.created_at
      from (select 1) one
      left join public.keys k
        on k.workspace_id = v_row.workspace_id
        and ((v_row.kind = 'security_leaked_key' and coalesce(v_row.payload ->> 'key_type', 'api_key') = 'api_key'
            and k.id = case when v_row.payload ->> 'key_id' ~* v_uuid then (v_row.payload ->> 'key_id')::uuid end)
          or (v_row.kind in ('spend_alert', 'spend_blocked') and v_row.payload #>> '{scope,type}' = 'key'
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

CREATE OR REPLACE FUNCTION public.list_workspace_spend_blocks (
  p_workspace_id   uuid,
  p_include_lifted boolean DEFAULT false,
  p_limit          integer DEFAULT 50,
  p_block_id       uuid    DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- A workspace's spend blocks for the control API and Settings, newest first: active ones only,
  -- or with p_include_lifted also lifted ones (up to p_limit, 1-100), or the one p_block_id names.
  -- Each has its rule's current name and the scope's display name. A block whose reset has passed
  -- but that the sweep has not lifted yet is listed as active: false.
  select coalesce(jsonb_agg(item.block order by item.started_at desc, item.id), '[]'::jsonb)
  from (
    select block.id, block.started_at, jsonb_build_object(
      'id', block.id,
      'workspace_id', block.workspace_id,
      'rule_id', block.rule_id,
      'rule_name', rule.name,
      'scope_type', block.scope_type,
      'scope_id', block.scope_id,
      'scope_label', private.spend_scope_label(block.workspace_id, block.scope_type, block.scope_id),
      'block_free_models', block.block_free_models,
      'period_start', block.period_start,
      'resets_at', block.resets_at,
      'spend_nanos', block.spend_nanos,
      'limit_nanos', block.limit_nanos,
      'started_at', block.started_at,
      'lifted_at', block.lifted_at,
      'lifted_by', block.lifted_by,
      'lift_reason', block.lift_reason,
      'active', block.lifted_at is null and (block.resets_at is null or block.resets_at > now())
    ) as block
    from public.workspace_spend_blocks block
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
    where block.workspace_id = p_workspace_id
      and case
        when p_block_id is not null then block.id = p_block_id
        when coalesce(p_include_lifted, false) then true
        else block.lifted_at is null
      end
    order by block.started_at desc, block.id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) item;
$function$;

COMMENT ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) IS 'A workspace''s spend blocks, newest first (active only by default), with rule and scope names. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_blocks"(uuid, boolean, integer, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.lift_workspace_spend_block (
  p_workspace_id  uuid,
  p_block_id      uuid,
  p_actor_user_id uuid                     DEFAULT NULL::uuid,
  p_now           timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Lifts an active spend block by hand (lift_reason manual, lifted_by the admin when known) and
-- queues the spend_blocked "lifted" event. The evaluator does not start the rule's block again
-- until its period resets. The caller (control API or web-api) checks the caller is an owner or
-- admin, writes the audit event and republishes the gateway's entry.
-- Errors: spend_block_not_found (no such block in the workspace), spend_block_not_active (it was
-- already lifted). Returns the block as public.list_workspace_spend_blocks shows it.
declare
  v_block public.workspace_spend_blocks;
begin
  if p_workspace_id is null or p_block_id is null or p_now is null then
    raise exception 'spend_block_not_found' using errcode = 'P0002';
  end if;
  select block.* into v_block
  from public.workspace_spend_blocks block
  where block.id = p_block_id and block.workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'spend_block_not_found' using errcode = 'P0002';
  end if;
  if v_block.lifted_at is not null then
    raise exception 'spend_block_not_active' using errcode = '55000';
  end if;

  update public.workspace_spend_blocks
  set lifted_at = greatest(p_now, started_at),
      lift_reason = 'manual',
      lifted_by = case when exists (select 1 from auth.users actor where actor.id = p_actor_user_id) then p_actor_user_id end
  where id = v_block.id;
  perform private.queue_spend_block_event(v_block.id, 'lifted', p_now);

  return public.list_workspace_spend_blocks(p_workspace_id, true, 1, v_block.id) -> 0;
end;
$function$;

COMMENT ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) IS 'Lifts an active spend block by hand (manual: it stays lifted until the period resets) and queues the spend_blocked lifted event. Service role only (control API and web-api, owners and admins).';

REVOKE ALL ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_workspace_spend_block"(uuid, uuid, uuid, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.get_workspace_spend_block_entry (
  p_workspace_id uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The compact entry the gateway enforces spend blocks from (KV spend-blocks:v1:{workspace}),
  -- or null when the workspace has nothing active, so the publisher deletes the key:
  --   * blocks: active blocks that have not reached their reset;
  --   * warnings: enabled block rules past their last warn threshold this period (every
  --     threshold_percents value, or threshold_amount_nanos) without an active block, i.e. in
  --     the grace margin. Requests they cover get the x-phaseo-spend-warning header;
  --   * departments: for each department scope above, who counts toward it, so the gateway can
  --     match a request without Postgres (private.spend_scope_departments as of now):
  --       keys          standard keys whose own department is this one (always count);
  --       users         actors (key creators, OAuth users) whose departments include it;
  --       exclude_keys  standard keys of those users that belong to another department.
  --     A request counts when its key is in keys, or its key is not in exclude_keys and its
  --     actor is in users.
  --   * expires_at: the earliest reset, which the KV entry's expiry must not pass.
  with blocks as (
    select block.id, block.rule_id, coalesce(rule.name, 'Deleted spend rule') as rule_name, block.scope_type, block.scope_id,
      block.resets_at, block.block_free_models, block.limit_nanos
    from public.workspace_spend_blocks block
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
    where block.workspace_id = p_workspace_id
      and block.lifted_at is null
      and (block.resets_at is null or block.resets_at > p_now)
  ),
  warnings as (
    select rule.id as rule_id, rule.name as rule_name, rule.scope_type, rule.scope_id, state.period_end as resets_at, rule.block_free_models
    from public.workspace_spend_rules rule
    join public.workspace_spend_rule_state state
      on state.rule_id = rule.id
      and state.period_start <= p_now
      and state.period_end > p_now
    where rule.workspace_id = p_workspace_id
      and rule.enabled
      and rule.deleted_at is null
      and rule.action = 'block'
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
      and case rule.metric
        when 'spend' then state.amount_fired_at is not null
        when 'budget_percent' then state.highest_percent_fired >= (select max(threshold) from unnest(rule.threshold_percents) threshold)
        else false
      end
      and not exists (select 1 from blocks where blocks.rule_id = rule.id)
  ),
  department_ids as materialized (
    select distinct lower(item.scope_id)::uuid as id
    from (select scope_type, scope_id from blocks union all select scope_type, scope_id from warnings) item
    where item.scope_type = 'department'
      and item.scope_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  actor_departments as materialized (
    select candidate.user_id, scope.department_id
    from (
      select grant_row.user_id from public.workspace_department_grants grant_row where grant_row.workspace_id = p_workspace_id
      union
      select override.user_id from public.workspace_member_overrides override
      where override.workspace_id = p_workspace_id and override.department_override_enabled
    ) candidate
    cross join lateral private.spend_scope_departments(p_workspace_id, null, candidate.user_id) scope(department_id)
    where exists (select 1 from department_ids)
  ),
  departments as (
    select department_ids.id,
      coalesce((
        select jsonb_agg(key.id order by key.id) from public.keys key
        where key.workspace_id = p_workspace_id and key.key_kind = 'standard' and key.department_id = department_ids.id
          and key.status <> 'deleted'
      ), '[]'::jsonb) as keys,
      coalesce((
        select jsonb_agg(actor.user_id order by actor.user_id) from actor_departments actor
        where actor.department_id = department_ids.id
      ), '[]'::jsonb) as users,
      coalesce((
        select jsonb_agg(key.id order by key.id) from public.keys key
        where key.workspace_id = p_workspace_id and key.key_kind = 'standard'
          and key.department_id is not null and key.department_id <> department_ids.id
          and key.status <> 'deleted'
          and key.created_by in (select actor.user_id from actor_departments actor where actor.department_id = department_ids.id)
      ), '[]'::jsonb) as exclude_keys
    from department_ids
  )
  select case when exists (select 1 from blocks) or exists (select 1 from warnings) then jsonb_build_object(
    'v', 1,
    'workspace_id', p_workspace_id,
    'generated_at', p_now,
    'expires_at', (select min(item.resets_at) from (select resets_at from blocks union all select resets_at from warnings) item),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', blocks.id,
        'rule_id', blocks.rule_id,
        'rule_name', left(blocks.rule_name, 100),
        'scope_type', blocks.scope_type,
        'scope_id', blocks.scope_id,
        'resets_at', blocks.resets_at,
        'block_free_models', blocks.block_free_models,
        'limit_nanos', blocks.limit_nanos
      ) order by blocks.resets_at nulls last, blocks.id)
      from blocks
    ), '[]'::jsonb),
    'warnings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rule_id', warnings.rule_id,
        'rule_name', left(warnings.rule_name, 100),
        'scope_type', warnings.scope_type,
        'scope_id', warnings.scope_id,
        'resets_at', warnings.resets_at,
        'block_free_models', warnings.block_free_models
      ) order by warnings.resets_at, warnings.rule_id)
      from warnings
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_object_agg(departments.id, jsonb_build_object(
        'keys', departments.keys, 'users', departments.users, 'exclude_keys', departments.exclude_keys))
      from departments
    ), '{}'::jsonb)
  ) end;
$function$;

COMMENT ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) IS 'The gateway''s spend block entry for a workspace (active blocks, grace-margin warnings and department membership for department scopes), or null when nothing is active. Published to KV spend-blocks:v1:{workspace} by the API. Service role only.';

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_block_entry"(uuid, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.list_spend_block_workspaces (
  p_limit integer DEFAULT 2000
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Workspaces that can have a gateway spend block entry: an enabled block rule, or an active
  -- block. The scheduled reconcile republishes these (plus every key already in KV), so a missed
  -- publish never lasts. Up to p_limit (1-10000), in id order.
  select workspace_id from (
    select rule.workspace_id from public.workspace_spend_rules rule
    where rule.action = 'block' and rule.enabled and rule.deleted_at is null
    union
    select block.workspace_id from public.workspace_spend_blocks block
    where block.lifted_at is null
  ) due
  order by workspace_id
  limit greatest(1, least(coalesce(p_limit, 2000), 10000));
$function$;

COMMENT ON FUNCTION "public"."list_spend_block_workspaces"(integer) IS 'Workspaces with an enabled block spend rule or an active spend block, for the scheduled republish of the gateway''s spend block entries. Service role only.';

REVOKE ALL ON FUNCTION "public"."list_spend_block_workspaces"(integer) FROM PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."list_spend_block_workspaces"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_spend_block_workspaces"(integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_spend_block_workspaces"(integer) TO "service_role";

CREATE OR REPLACE FUNCTION public.lift_spend_blocks_on_rule_change ()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Lifts a spend rule's active block in the same transaction as the change that ends it, so an
-- admin who turns a rule off or raises its limit unblocks at once rather than at the next sweep:
--   * the rule is deleted (DELETE, e.g. a cascade from its key, member or department, or
--     deleted_at set): rule_deleted;
--   * enabled turned off: rule_disabled;
--   * its action, metric, scope, period, time zone or base changed: rule_changed;
--   * its block point changed (block_at_amount_nanos, block_at_percent or base_amount_nanos) and
--     spend so far this period (private.spend_rule_values) is now below it: rule_changed.
-- A change to block_free_models is copied onto the active block. Each lift queues a
-- spend_blocked "lifted" event. Nothing happens while the workspace itself is being deleted
-- (its blocks go with it). The API that made the change republishes the gateway's entry.
declare
  v_rule public.workspace_spend_rules;
  v_block public.workspace_spend_blocks;
  v_reason text;
  v_value numeric;
  v_base bigint;
  v_limit numeric;
begin
  v_rule := case when tg_op = 'DELETE' then old else new end;
  select block.* into v_block
  from public.workspace_spend_blocks block
  where block.rule_id = old.id and block.lifted_at is null
  for update;
  if not found or not exists (select 1 from public.workspaces workspace where workspace.id = old.workspace_id) then
    return v_rule;
  end if;

  if tg_op = 'DELETE' or new.deleted_at is not null then
    v_reason := 'rule_deleted';
  elsif not new.enabled then
    v_reason := 'rule_disabled';
  elsif new.action <> 'block'
    or new.metric is distinct from old.metric
    or new.scope_type is distinct from old.scope_type
    or new.scope_id is distinct from old.scope_id
    or new.period is distinct from old.period
    or new.window_hours is distinct from old.window_hours
    or new.time_zone is distinct from old.time_zone
    or new.base_kind is distinct from old.base_kind
    or new.base_ref is distinct from old.base_ref then
    v_reason := 'rule_changed';
  elsif new.block_at_amount_nanos is distinct from old.block_at_amount_nanos
    or new.block_at_percent is distinct from old.block_at_percent
    or new.base_amount_nanos is distinct from old.base_amount_nanos then
    select value.value_nanos, value.base_nanos into v_value, v_base
    from private.spend_rule_values(new.workspace_id, now(), new.id) value;
    v_limit := case new.metric
      when 'spend' then new.block_at_amount_nanos
      when 'budget_percent' then case when v_base > 0 then ceil(new.block_at_percent::numeric * v_base / 100) end
    end;
    if v_limit is null or coalesce(v_value, 0) < v_limit then
      v_reason := 'rule_changed';
    end if;
  end if;

  if v_reason is null then
    if new.block_free_models is distinct from v_block.block_free_models then
      update public.workspace_spend_blocks set block_free_models = new.block_free_models where id = v_block.id;
    end if;
    return v_rule;
  end if;

  update public.workspace_spend_blocks
  set lifted_at = greatest(now(), started_at), lift_reason = v_reason
  where id = v_block.id;
  perform private.queue_spend_block_event(v_block.id, 'lifted', now());
  return v_rule;
end;
$function$;

COMMENT ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() IS 'Trigger on workspace_spend_rules (after update, before delete): lifts the rule''s active spend block when the rule is deleted, disabled, changed in scope or period, or its block point rises above spend so far, and queues the spend_blocked lifted event.';

GRANT EXECUTE ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."lift_spend_blocks_on_rule_change"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER workspace_spend_rules_lift_blocks
  AFTER UPDATE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.lift_spend_blocks_on_rule_change();

CREATE TRIGGER workspace_spend_rules_lift_blocks_on_delete
  BEFORE DELETE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.lift_spend_blocks_on_rule_change();
