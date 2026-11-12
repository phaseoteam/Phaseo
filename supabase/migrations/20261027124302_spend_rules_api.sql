-- phaseo:allow-destructive-migration reason: the only DELETE statements are inside two new functions: save_workspace_spend_rule removes the destination links a saved rule no longer lists, and consume_spend_rule_test_send prunes its own day-old per-minute counters. The migration itself deletes no data.

-- Spend rules control API (PR 6 of the spend rules stack).
-- * Management scopes spend_rules:read, spend_rules:write and spend_rules:delete for the
--   first-party CLI OAuth client.
-- * private.spend_rule_values and private.spend_rule_alert_text: the evaluator's value query and
--   alert text, extracted unchanged so the API preview and test sends compute exactly what the
--   evaluator does. private.evaluate_workspace_spend_rules now calls them.
-- * public.preview_workspace_spend_rule (read-only preview), public.list_workspace_spend_rule_history
--   (events and state rows, paged in SQL, through the new partial index
--   email_outbox_spend_rule_events_idx), public.save_workspace_spend_rule (rule and destinations in
--   one transaction, marks the workspace dirty), public.consume_spend_rule_test_send with
--   workspace_spend_rule_test_sends (5 test sends per minute per workspace).
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

UPDATE public.oauth_clients
SET allowed_scopes = array(
  SELECT DISTINCT scope
  FROM unnest(coalesce(allowed_scopes, '{}'::text[]) || array['spend_rules:read', 'spend_rules:write', 'spend_rules:delete']) scope
  ORDER BY scope
), updated_at = now()
WHERE id = 'phaseo_cli';

CREATE TABLE "public"."workspace_spend_rule_test_sends" (
  "workspace_id"  uuid                     NOT NULL,
  "bucket_start"  timestamp with time zone NOT NULL,
  "request_count" integer                  NOT NULL,
  CONSTRAINT "workspace_spend_rule_test_sends_pkey" PRIMARY KEY (workspace_id, bucket_start),
  CONSTRAINT "workspace_spend_rule_test_sends_request_count_check" CHECK ((request_count >= 1)),
  CONSTRAINT "workspace_spend_rule_test_sends_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rule_test_sends"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_test_sends_bucket_start_idx ON public.workspace_spend_rule_test_sends USING btree (bucket_start);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_rule_test_sends"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_spend_rule_test_sends" IS 'Spend rule test sends per workspace per minute, for the abuse cap of 5 a minute (public.consume_spend_rule_test_send). Rows older than a day are pruned as new ones are written. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_test_sends" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_test_sends" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_test_sends" FROM "anon", "authenticated";

CREATE INDEX email_outbox_spend_rule_events_idx ON public.email_outbox USING btree (((payload ->> 'rule_id'::text)), created_at DESC, id DESC)
  WHERE (kind = ANY (ARRAY['spend_alert'::text, 'spend_blocked'::text]));

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
  p_threshold_percent      integer
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
  -- The text of a spend alert (calendar spend and budget_percent rules): the scope's label, the
  -- title and the message, in US money format with the reset time in the rule's zone. Used by
  -- private.evaluate_workspace_spend_rules for real alerts and by
  -- public.preview_workspace_spend_rule for previews and test sends, so both read the same.
  --   p_threshold_percent: the threshold the alert names (budget_percent).
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
        else private.workspace_push_usd(p_base_nanos)
      end as base_short,
      case p_period when 'day' then 'today' when 'week' then 'this week' else 'this month' end as so_far,
      'The ' || case p_period when 'day' then 'day' when 'week' then 'week' else 'month' end || ' resets '
        || to_char(p_period_end at time zone p_time_zone, 'Mon FMDD, HH24:MI') || ' ' || p_time_zone || '.' as resets
    from label
  )
  select
    parts.scope_label,
    left(p_rule_name, 100) || ': ' || case when p_metric = 'spend'
        then private.workspace_push_usd(p_threshold_amount_nanos) || ' reached'
        else p_threshold_percent || '% of ' || parts.base_short || ' reached'
      end,
    parts.subject || ' has spent ' || private.workspace_push_usd(p_value_nanos) || ' ' || parts.so_far
      || case when p_metric = 'spend'
        then ', past the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold. '
        else ': ' || to_char(floor(p_value_nanos * 100 / p_base_nanos), 'FM999,999,990') || '% of '
          || case p_base_kind
            when 'amount' then private.workspace_push_usd(p_base_nanos)
            else parts.base_short || ' (' || private.workspace_push_usd(p_base_nanos) || ')'
          end
          || '. Alerts at ' || (select string_agg(threshold || '%', ', ' order by threshold) from unnest(p_threshold_percents) threshold) || '. '
      end
      || parts.resets
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) IS 'Scope label, title and message of a spend alert for a calendar spend or budget_percent rule. Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_alert_text"(text, text, text, text, text, uuid, uuid, uuid, text, timestamp with time zone, text, text, text, bigint, integer[], bigint, numeric, integer) TO "service_role";

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
-- preview and by test sends. Rules without a calendar period (rolling, spike, balance) get
-- period, value and alert null. evaluated is false for rules the evaluator does not handle yet
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
  where state.rule_id = v_rule.id and state.period_start = v_value.period_start;
  v_has_state := found;

  if v_rule.metric in ('budget_percent', 'forecast') and v_value.base_nanos > 0 and v_rule.threshold_percents is not null then
    select
      max(threshold) filter (where v_value.value_nanos * 100 >= threshold::numeric * v_value.base_nanos),
      min(threshold) filter (where v_value.value_nanos * 100 < threshold::numeric * v_value.base_nanos)
      into v_reached, v_next
    from unnest(v_rule.threshold_percents) threshold;
    v_next_nanos := ceil(v_next::numeric * v_value.base_nanos / 100);
  elsif v_rule.threshold_amount_nanos is not null and v_value.value_nanos < v_rule.threshold_amount_nanos then
    v_next_nanos := v_rule.threshold_amount_nanos;
  end if;

  if v_rule.action = 'block' then
    v_block_nanos := case
      when v_rule.metric = 'spend' then v_rule.block_at_amount_nanos
      when v_value.base_nanos > 0 then ceil(v_rule.block_at_percent::numeric * v_value.base_nanos / 100)
    end;
  end if;

  if v_rule.metric = 'spend' or (v_rule.metric = 'budget_percent' and v_value.base_nanos > 0) then
    select alert.* into v_alert
    from private.spend_rule_alert_text(
      v_workspace_name, v_rule.name, v_rule.metric, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id,
      v_rule.scope_user_id, v_rule.scope_department_id, v_rule.period, v_value.period_end, v_value.time_zone,
      v_rule.base_kind, v_rule.base_ref, v_value.base_nanos, v_rule.threshold_percents, v_rule.threshold_amount_nanos,
      v_value.value_nanos, coalesce(v_reached, v_rule.threshold_percents[1])
    ) alert;
    v_has_alert := found;
  end if;

  return jsonb_build_object(
    'rule_id', v_rule.id,
    'metric', v_rule.metric,
    'evaluated', v_evaluated,
    'computed_at', p_now,
    'time_zone', v_value.time_zone,
    'period', jsonb_build_object('kind', v_rule.period, 'start', v_value.period_start, 'end', v_value.period_end),
    'value_nanos', v_value.value_nanos,
    'base_kind', v_rule.base_kind,
    'base_ref', v_rule.base_ref,
    'base_nanos', v_value.base_nanos,
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

CREATE OR REPLACE FUNCTION public.list_workspace_spend_rule_history (
  p_workspace_id uuid,
  p_rule_id      uuid,
  p_limit        integer DEFAULT 50,
  p_offset       integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- A spend rule's history, newest first: the events it queued (email_outbox spend_alert and
-- spend_blocked rows whose payload names the rule, read through
-- email_outbox_spend_rule_events_idx) with their delivery counts, one page of p_limit (1-100)
-- after p_offset, plus its 12 latest workspace_spend_rule_state rows. Test sends write nothing,
-- so they are not here. Errors: spend_rule_not_found, invalid_spend_rule_history_page.
-- Returns {events: [...], has_more, periods: [...]}.
declare
  v_events jsonb;
  v_has_more boolean;
  v_periods jsonb;
begin
  if p_workspace_id is null or p_rule_id is null
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 or p_offset > 100000 then
    raise exception 'invalid_spend_rule_history_page' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.workspace_spend_rules rule
    where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null
  ) then
    raise exception 'spend_rule_not_found' using errcode = 'P0002';
  end if;

  with candidates as (
    select event.id, event.kind, event.created_at, event.payload
    from public.email_outbox event
    where (event.payload ->> 'rule_id') = p_rule_id::text
      and event.kind = any (array['spend_alert', 'spend_blocked'])
      and event.workspace_id = p_workspace_id
    order by event.created_at desc, event.id desc
    limit p_limit + 1
    offset p_offset
  ),
  page as (
    select candidates.*, row_number() over (order by candidates.created_at desc, candidates.id desc) as position
    from candidates
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'kind', page.kind,
      'created_at', page.created_at,
      'title', page.payload ->> 'title',
      'message', page.payload ->> 'message',
      'state', page.payload ->> 'state',
      'threshold_percent', page.payload -> 'threshold_percent',
      'thresholds_crossed', page.payload -> 'thresholds_crossed',
      'threshold_amount_nanos', page.payload -> 'threshold_amount_nanos',
      'value_nanos', page.payload -> 'value_nanos',
      'base_nanos', page.payload -> 'base_nanos',
      'percent', page.payload -> 'percent',
      'period', page.payload -> 'period',
      'deliveries', jsonb_build_object('sent', deliveries.sent, 'failed', deliveries.failed, 'pending', deliveries.pending)
    ) order by page.position) filter (where page.position <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into v_events, v_has_more
  from page
  cross join lateral (
    select
      count(*) filter (where attempt.status = 'sent') as sent,
      count(*) filter (where attempt.status = 'failed') as failed,
      count(*) filter (where attempt.status not in ('sent', 'failed')) as pending
    from public.notification_delivery_attempts attempt
    where attempt.event_id = page.id
  ) deliveries;

  select coalesce(jsonb_agg(jsonb_build_object(
      'period_start', case when isfinite(state.period_start) then state.period_start end,
      'period_end', state.period_end,
      'highest_percent_fired', state.highest_percent_fired,
      'amount_fired_at', state.amount_fired_at,
      'last_fired_at', state.last_fired_at,
      'fire_count', state.fire_count,
      'last_value_nanos', state.last_value_nanos,
      'last_base_nanos', state.last_base_nanos
    ) order by state.period_start desc), '[]'::jsonb)
    into v_periods
  from (
    select * from public.workspace_spend_rule_state recent
    where recent.rule_id = p_rule_id and recent.workspace_id = p_workspace_id
    order by recent.period_start desc
    limit 12
  ) state;

  return jsonb_build_object('events', v_events, 'has_more', coalesce(v_has_more, false), 'periods', v_periods);
end;
$function$;

COMMENT ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) IS 'One page of a spend rule''s queued events (spend_alert, spend_blocked) with delivery counts, newest first, plus its 12 latest state rows. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_workspace_spend_rule_history"(uuid, uuid, integer, integer) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_workspace_spend_rule (
  p_workspace_id    uuid,
  p_rule_id         uuid,
  p_rule            jsonb,
  p_destination_ids uuid[],
  p_actor_user_id   uuid DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Creates (p_rule_id null) or replaces (p_rule_id set) a spend rule and its destinations in one
-- transaction, for the control API and web-api, which validate the whole rule first and pass
-- every editable column in p_rule. The table's trigger and CHECK constraints still decide.
--   * p_destination_ids null keeps the rule's destinations; an array (at most 50, each an
--     active or disabled notification destination of the workspace) replaces them. An empty
--     array means the workspace's spend_alert routes apply.
--   * An enabled rule marks the workspace in workspace_spend_rule_dirty, so the sweep evaluates
--     it within one tick.
-- Errors: spend_rule_not_found, too_many_spend_rule_destinations,
-- notification_destination_not_found, plus the table's (spend_rule_limit_reached,
-- invalid_time_zone, invalid_spend_rule_scope_id, constraint names).
-- Returns {rule: <row>, destination_ids: [...]}.
declare
  v_input public.workspace_spend_rules;
  v_rule public.workspace_spend_rules;
begin
  if p_workspace_id is null or p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'invalid_spend_rule' using errcode = '22023';
  end if;
  if p_destination_ids is not null then
    if cardinality(p_destination_ids) > 50 then
      raise exception 'too_many_spend_rule_destinations' using errcode = '22023';
    end if;
    if exists (
      select 1 from unnest(p_destination_ids) requested(destination_id)
      where requested.destination_id is null or not exists (
        select 1 from public.notification_destinations destination
        where destination.id = requested.destination_id
          and destination.workspace_id = p_workspace_id
          and destination.status <> 'deleted'
          and not destination.is_ephemeral
      )
    ) then
      raise exception 'notification_destination_not_found' using errcode = '23503';
    end if;
  end if;

  v_input := jsonb_populate_record(null::public.workspace_spend_rules, p_rule);

  if p_rule_id is null then
    insert into public.workspace_spend_rules (
      workspace_id, name, enabled, metric, scope_type, scope_id, period, window_hours, time_zone,
      base_kind, base_ref, base_amount_nanos, threshold_percents, threshold_amount_nanos, runway_days,
      spike_multiplier, spike_floor_nanos, action, block_at_percent, block_at_amount_nanos,
      block_free_models, cooldown_minutes, created_by
    )
    values (
      p_workspace_id, v_input.name, coalesce(v_input.enabled, true), v_input.metric,
      coalesce(v_input.scope_type, 'workspace'), v_input.scope_id, v_input.period, v_input.window_hours,
      v_input.time_zone, v_input.base_kind, v_input.base_ref, v_input.base_amount_nanos, v_input.threshold_percents,
      v_input.threshold_amount_nanos, v_input.runway_days, v_input.spike_multiplier, v_input.spike_floor_nanos,
      coalesce(v_input.action, 'notify'), coalesce(v_input.block_at_percent, 110), v_input.block_at_amount_nanos,
      coalesce(v_input.block_free_models, false), coalesce(v_input.cooldown_minutes, 360), p_actor_user_id
    )
    returning * into v_rule;
  else
    update public.workspace_spend_rules rule set
      name = v_input.name,
      enabled = coalesce(v_input.enabled, true),
      metric = v_input.metric,
      scope_type = coalesce(v_input.scope_type, 'workspace'),
      scope_id = v_input.scope_id,
      period = v_input.period,
      window_hours = v_input.window_hours,
      time_zone = v_input.time_zone,
      base_kind = v_input.base_kind,
      base_ref = v_input.base_ref,
      base_amount_nanos = v_input.base_amount_nanos,
      threshold_percents = v_input.threshold_percents,
      threshold_amount_nanos = v_input.threshold_amount_nanos,
      runway_days = v_input.runway_days,
      spike_multiplier = v_input.spike_multiplier,
      spike_floor_nanos = v_input.spike_floor_nanos,
      action = coalesce(v_input.action, 'notify'),
      block_at_percent = coalesce(v_input.block_at_percent, 110),
      block_at_amount_nanos = v_input.block_at_amount_nanos,
      block_free_models = coalesce(v_input.block_free_models, false),
      cooldown_minutes = coalesce(v_input.cooldown_minutes, 360)
    where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null
    returning * into v_rule;
    if not found then
      raise exception 'spend_rule_not_found' using errcode = 'P0002';
    end if;
  end if;

  if p_destination_ids is not null then
    delete from public.workspace_spend_rule_destinations link
    where link.rule_id = v_rule.id and not (link.destination_id = any (p_destination_ids));
    insert into public.workspace_spend_rule_destinations (rule_id, destination_id, workspace_id)
    select distinct v_rule.id, requested.destination_id, p_workspace_id
    from unnest(p_destination_ids) requested(destination_id)
    on conflict (rule_id, destination_id) do nothing;
  end if;

  if v_rule.enabled then
    insert into public.workspace_spend_rule_dirty (workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
  end if;

  return jsonb_build_object(
    'rule', to_jsonb(v_rule),
    'destination_ids', coalesce((
      select jsonb_agg(link.destination_id order by link.destination_id)
      from public.workspace_spend_rule_destinations link
      where link.rule_id = v_rule.id
    ), '[]'::jsonb)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) IS 'Creates or replaces a spend rule and (when p_destination_ids is not null) its destinations in one transaction, and marks the workspace for evaluation. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_workspace_spend_rule"(uuid, uuid, jsonb, uuid[], uuid) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.consume_spend_rule_test_send (
  p_workspace_id uuid,
  p_limit        integer DEFAULT 5
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Takes one spend rule test send from the workspace's allowance for the current minute (5 by
-- default, the same on every plan): true if allowed, false once the minute's allowance is used.
-- The same fixed-window counter as public.consume_checkout_rate_limit, keyed by workspace so the
-- control API and the settings page share it.
declare
  v_accepted integer;
  v_bucket timestamptz := date_trunc('minute', now());
begin
  if p_workspace_id is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_spend_rule_test_send_limit' using errcode = '22023';
  end if;
  delete from public.workspace_spend_rule_test_sends target
  using (
    select expired.workspace_id, expired.bucket_start
    from public.workspace_spend_rule_test_sends expired
    where expired.bucket_start < now() - interval '1 day'
    order by expired.bucket_start
    limit 100
  ) old
  where target.workspace_id = old.workspace_id
    and target.bucket_start = old.bucket_start;
  insert into public.workspace_spend_rule_test_sends as sends (workspace_id, bucket_start, request_count)
  values (p_workspace_id, v_bucket, 1)
  on conflict (workspace_id, bucket_start) do update
    set request_count = sends.request_count + 1
    where sends.request_count < p_limit
  returning sends.request_count into v_accepted;
  return v_accepted is not null;
end;
$function$;

COMMENT ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) IS 'Fixed-window limiter for spend rule test sends: true while the workspace has sent fewer than p_limit (default 5) this minute. Service role only.';

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_spend_rule_test_send"(uuid, integer) FROM "anon", "authenticated";
