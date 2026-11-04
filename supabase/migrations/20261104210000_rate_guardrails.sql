-- phaseo:allow-destructive-migration reason: recreates public.refresh_rate_limit_throttle_rollups unchanged except for one more limit scope; its DELETEs only replace and prune its own per-minute throttle rollup rows, as before. Also drops and re-adds the throttle table's limit_scope CHECK constraint to allow 'workspace'. The migration itself deletes no rows and drops no table or column.

-- Guardrail levels, phase C: rate guardrails.
-- 1. A rate guardrail (kind 'rate') holds requests per minute, tokens per minute, concurrent requests,
--    fail closed, and how it counts (rate_counting):
--      shared         one allowance for everything it is assigned to (the whole department, all of a
--                     member's keys, the whole workspace);
--      each_key       a separate allowance for each key (or OAuth user) it covers;
--      each_end_user  a separate allowance for each end user (the request's user id);
--      NULL           set through the rate limits API, which has no counting field: one allowance for
--                     each key, member or department it is assigned to, and one for each end user when
--                     assigned to the whole workspace (how rate limit policies always counted).
--    A rate guardrail sets nothing else, and only rate guardrails set these columns.
-- 2. Every rate limit policy becomes a rate guardrail with the same id, and its assignments become
--    guardrail assignments with the same ids: key, member and department at those levels, the
--    end-user default at workspace level. A policy assigned to a guardrail (a separate allowance for
--    each key that guardrail covers) gets a second rate guardrail counted each_key, assigned wherever
--    that guardrail is. Key and member rows also go in key_guardrails and workspace_member_guardrails,
--    which the levels table is copied from; the copy keeps the row written here, and its id.
-- 3. Throttle alerts name the rate guardrail, and throttles can come from an allowance shared by the
--    whole workspace (limit scope 'workspace').
-- The policy tables are kept, and nothing reads or writes them after this release. Nothing is
-- deleted here, and no table or column is dropped.

SET local check_function_bodies = off;

-- ---- 1. rate columns
ALTER TABLE "public"."workspace_guardrails"
  ADD COLUMN "rate_requests_per_minute" integer,
  ADD COLUMN "rate_tokens_per_minute" bigint,
  ADD COLUMN "rate_concurrent_requests" integer,
  ADD COLUMN "rate_fail_closed" boolean NOT NULL DEFAULT false,
  ADD COLUMN "rate_counting" text;

ALTER TABLE "public"."workspace_guardrails"
  ADD CONSTRAINT "workspace_guardrails_rate_requests_per_minute_check" CHECK (((rate_requests_per_minute IS NULL) OR (rate_requests_per_minute > 0))),
  ADD CONSTRAINT "workspace_guardrails_rate_tokens_per_minute_check" CHECK (((rate_tokens_per_minute IS NULL) OR (rate_tokens_per_minute > 0))),
  ADD CONSTRAINT "workspace_guardrails_rate_concurrent_requests_check" CHECK (((rate_concurrent_requests IS NULL) OR (rate_concurrent_requests > 0))),
  ADD CONSTRAINT "workspace_guardrails_rate_counting_check" CHECK (((rate_counting IS NULL) OR (rate_counting = ANY (ARRAY['shared'::text, 'each_key'::text, 'each_end_user'::text])))),
  -- A rate guardrail has a limit and sets nothing else; any other kind sets no rate column.
  ADD CONSTRAINT "workspace_guardrails_rate_kind_check" CHECK ((
    ((kind = 'rate'::text)
      AND (num_nonnulls(rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests) > 0)
      AND privacy_enable_paid_may_train AND privacy_enable_free_may_train
      AND privacy_enable_free_may_publish_prompts AND privacy_enable_input_output_logging
      AND (NOT privacy_zdr_only)
      AND (provider_restriction_mode = 'none'::text) AND (model_restriction_mode = 'none'::text)
      AND (NOT prompt_injection_enabled) AND (NOT sensitive_info_enabled))
    OR ((kind <> 'rate'::text)
      AND (num_nonnulls(rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests, rate_counting) = 0)
      AND (NOT rate_fail_closed))));

COMMENT ON COLUMN "public"."workspace_guardrails"."rate_counting" IS 'How a rate guardrail counts: shared (one allowance for everything it is assigned to), each_key (one per key or OAuth user it covers) or each_end_user (one per end user). NULL for rate guardrails made through the rate limits API: one allowance per key, member or department it is assigned to, and per end user at workspace level.';

COMMENT ON COLUMN "public"."workspace_guardrails"."rate_fail_closed" IS 'A rate guardrail waits for its counters and rejects the request when they cannot answer, instead of letting it through.';

-- ---- 2. copy the policies
DO $$
begin
  -- No policy or assignment can change between the copy and the last insert.
  lock table public.workspace_rate_limit_policies, public.workspace_rate_limit_policy_assignments in share mode;

  insert into public.workspace_guardrails (
    id, workspace_id, name, description, kind, enabled,
    rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests, rate_fail_closed, rate_counting,
    created_at, updated_at)
  select p.id, p.workspace_id, p.name, p.description, 'rate', true,
    p.requests_per_minute, p.tokens_per_minute, p.concurrent_requests, p.fail_closed, null,
    p.created_at, p.updated_at
  from public.workspace_rate_limit_policies p
  on conflict (id) do nothing;

  -- A policy on a guardrail gave each key that guardrail covers its own allowance, while that
  -- guardrail was enabled. The replacement has a deterministic version 4 id, is enabled when one of
  -- those guardrails is, and is assigned where the enabled ones are (where all are, when none is).
  insert into public.workspace_guardrails (
    id, workspace_id, name, description, kind, enabled,
    rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests, rate_fail_closed, rate_counting,
    created_at, updated_at)
  select overlay(overlay(md5(p.id::text || ':each_key') placing '4' from 13) placing '8' from 17)::uuid, p.workspace_id, left(p.name, 90) || ' (each key)', p.description, 'rate',
    exists (
      select 1 from public.workspace_rate_limit_policy_assignments a
      join public.workspace_guardrails source on source.id = a.guardrail_id
      where a.policy_id = p.id and a.target_type = 'guardrail' and source.enabled),
    p.requests_per_minute, p.tokens_per_minute, p.concurrent_requests, p.fail_closed, 'each_key',
    p.created_at, p.updated_at
  from public.workspace_rate_limit_policies p
  where exists (
    select 1 from public.workspace_rate_limit_policy_assignments a
    where a.policy_id = p.id and a.target_type = 'guardrail')
  on conflict (id) do nothing;

  insert into public.workspace_guardrail_assignments (id, workspace_id, guardrail_id, target_type, target_id, created_at, created_by)
  select a.id, a.workspace_id, a.policy_id,
    case a.target_type when 'end_user_default' then 'workspace' else a.target_type end,
    case a.target_type when 'key' then a.key_id when 'member' then a.user_id when 'department' then a.department_id end,
    a.created_at, a.created_by
  from public.workspace_rate_limit_policy_assignments a
  where a.target_type in ('key', 'member', 'department', 'end_user_default')
  on conflict do nothing;

  insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id, created_at, created_by)
  select a.workspace_id, overlay(overlay(md5(a.policy_id::text || ':each_key') placing '4' from 13) placing '8' from 17)::uuid, covered.target_type, covered.target_id, a.created_at, a.created_by
  from public.workspace_rate_limit_policy_assignments a
  join public.workspace_guardrails source on source.id = a.guardrail_id
  join public.workspace_guardrail_assignments covered
    on covered.guardrail_id = a.guardrail_id and covered.workspace_id = a.workspace_id
  where a.target_type = 'guardrail'
    and (source.enabled or not exists (
      select 1 from public.workspace_rate_limit_policy_assignments other
      join public.workspace_guardrails other_source on other_source.id = other.guardrail_id
      where other.policy_id = a.policy_id and other.target_type = 'guardrail' and other_source.enabled))
  on conflict do nothing;

  insert into public.key_guardrails (key_id, guardrail_id, created_at)
  select a.target_id, a.guardrail_id, a.created_at
  from public.workspace_guardrail_assignments a
  join public.workspace_guardrails g on g.id = a.guardrail_id and g.kind = 'rate'
  where a.target_type = 'key'
  on conflict do nothing;

  insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id, created_at)
  select a.workspace_id, a.target_id, a.guardrail_id, a.created_at
  from public.workspace_guardrail_assignments a
  join public.workspace_guardrails g on g.id = a.guardrail_id and g.kind = 'rate'
  where a.target_type = 'member'
  on conflict do nothing;
end;
$$;

COMMENT ON TABLE "public"."workspace_rate_limit_policies" IS 'Superseded by rate guardrails (workspace_guardrails kind rate), which were copied from this table with the same ids. Nothing reads or writes it; kept until it is dropped.';

COMMENT ON TABLE "public"."workspace_rate_limit_policy_assignments" IS 'Superseded by workspace_guardrail_assignments of rate guardrails, which were copied from this table with the same ids. Nothing reads or writes it; kept until it is dropped.';

-- ---- 3. throttle alerts name the rate guardrail
CREATE OR REPLACE FUNCTION public.enqueue_rate_limit_throttle_alerts ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  SET statement_timeout TO '10s'
  SET lock_timeout TO '2s'
  AS $function$
declare
  v_window_minutes constant integer := 15;
  v_to timestamptz := date_trunc('minute', now());
  v_from timestamptz := date_trunc('minute', now()) - make_interval(mins => v_window_minutes);
  v_inserted integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('enqueue_rate_limit_throttle_alerts', 0)) then
    return 0;
  end if;

  -- Only workspaces that routed this alert to an active destination are alerted,
  -- at most once per hour each. The routed delivery job sends the event.
  with routed as (
    select distinct route.workspace_id
    from public.notification_event_destinations route
    join public.notification_destinations destination on destination.id = route.destination_id
    where route.event_kind = 'rate_limit_throttled'
      and destination.status = 'active'
  ),
  throttles as (
    select
      throttle.workspace_id,
      throttle.policy_id,
      throttle.limit_scope,
      sum(throttle.throttled_requests)::bigint as throttled_requests
    from public.workspace_rate_limit_throttles_minute throttle
    join routed on routed.workspace_id = throttle.workspace_id
    where throttle.bucket_start >= v_from
    group by throttle.workspace_id, throttle.policy_id, throttle.limit_scope
  ),
  ranked as (
    select
      throttles.*,
      row_number() over (partition by throttles.workspace_id order by throttles.throttled_requests desc, throttles.policy_id, throttles.limit_scope) as position
    from throttles
  ),
  summary as (
    select
      ranked.workspace_id,
      sum(ranked.throttled_requests)::bigint as throttled_requests,
      jsonb_agg(
        jsonb_build_object(
          'policy_id', ranked.policy_id,
          'policy_name', coalesce(guardrail.name, policy.name),
          'limit_scope', ranked.limit_scope,
          'throttled_requests', ranked.throttled_requests
        )
        order by ranked.position
      ) filter (where ranked.position <= 5) as policies
    from ranked
    -- Rate guardrails kept the ids of the policies they replaced; older throttles may name a policy only.
    left join public.workspace_guardrails guardrail on guardrail.id = ranked.policy_id
    left join public.workspace_rate_limit_policies policy on policy.id = ranked.policy_id
    group by ranked.workspace_id
  )
  insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
  select
    'rate_limit_throttled',
    'rate_limit_throttled',
    coalesce(owner.email, ''),
    'Rate limit alert',
    summary.workspace_id,
    workspace.owner_user_id,
    jsonb_build_object(
      'workspace_name', workspace.name,
      'throttled_requests', summary.throttled_requests,
      'window_minutes', v_window_minutes,
      'window_start', v_from,
      'window_end', v_to,
      'policies', summary.policies
    ),
    'rate_limit_throttled:' || summary.workspace_id || ':' || to_char(date_trunc('hour', now()) at time zone 'UTC', 'YYYY-MM-DD"T"HH24')
  from summary
  join public.workspaces workspace on workspace.id = summary.workspace_id
  left join auth.users owner on owner.id = workspace.owner_user_id
  where not exists (
    select 1
    from public.email_outbox previous
    where previous.workspace_id = summary.workspace_id
      and previous.kind = 'rate_limit_throttled'
      and previous.created_at > now() - interval '1 hour'
  )
  on conflict (dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

COMMENT ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() IS 'Queues one rate_limit_throttled notification event per routed workspace with policy throttles in the last 15 minutes, at most once per hour.';

GRANT EXECUTE ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_rate_limit_throttle_alerts"() FROM PUBLIC, "anon", "authenticated";

-- ---- 4. a rate guardrail shared by the whole workspace throttles with limit scope 'workspace'
ALTER TABLE "public"."workspace_rate_limit_throttles_minute"
  DROP CONSTRAINT "workspace_rate_limit_throttles_minute_limit_scope_check",
  ADD CONSTRAINT "workspace_rate_limit_throttles_minute_limit_scope_check"
    CHECK ((limit_scope = ANY (ARRAY['key'::text, 'member'::text, 'guardrail'::text, 'end_user'::text, 'department'::text, 'workspace'::text])));

CREATE OR REPLACE FUNCTION public.refresh_rate_limit_throttle_rollups (
  p_since timestamp with time zone DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '30s'
  SET lock_timeout TO '2s'
  AS $function$
declare
  -- Rebuilding the trailing hour absorbs late audit writes and a few missed runs.
  v_from timestamptz := date_trunc('minute',
    greatest(coalesce(p_since, now() - interval '1 hour'), now() - interval '1 day'));
  v_rows integer;
  v_pruned integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.refresh_rate_limit_throttle_rollups', 0)) then
    return jsonb_build_object('rows', 0, 'pruned', 0, 'skipped_locked', true);
  end if;

  delete from public.workspace_rate_limit_throttles_minute rollup
  where rollup.bucket_start >= v_from;

  insert into public.workspace_rate_limit_throttles_minute (
    bucket_start, workspace_id, policy_id, limit_scope, key_id, throttled_requests
  )
  select
    date_trunc('minute', fact.occurred_at),
    fact.workspace_id,
    (fact.safe_metadata->'rate_limit'->>'policy_id')::uuid,
    fact.safe_metadata->'rate_limit'->>'limit_scope',
    fact.key_id,
    count(*)
  from public.v2_request_facts fact
  where fact.occurred_at >= v_from
    and fact.error_code = 'user:rate_limit_exceeded'
    and fact.safe_metadata->'rate_limit'->>'policy_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and fact.safe_metadata->'rate_limit'->>'limit_scope' in ('key', 'member', 'guardrail', 'end_user', 'department', 'workspace')
    -- Facts outlive their workspace; its rollup rows were removed with it.
    and exists (select 1 from public.workspaces workspace where workspace.id = fact.workspace_id)
  group by 1, 2, 3, 4, 5;
  get diagnostics v_rows = row_count;

  delete from public.workspace_rate_limit_throttles_minute rollup
  where rollup.bucket_start < now() - interval '30 days';
  get diagnostics v_pruned = row_count;

  return jsonb_build_object('from', v_from, 'rows', v_rows, 'pruned', v_pruned);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) TO "service_role";

COMMENT ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) IS 'Rebuilds per-minute rate limit policy throttle counts from v2_request_facts since p_since (default one hour ago, at most one day), then prunes rows older than 30 days. Runs on the gateway''s five-minute schedule.';

REVOKE ALL ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_rate_limit_throttle_rollups"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
