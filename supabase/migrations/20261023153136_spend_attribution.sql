-- Spend attribution for spend rules: who made each request, and which departments it counts toward.
-- * v2_private_usage_15m gains actor_user_id (the OAuth user for OAuth tokens, otherwise the
--   key's OAuth user or creator), part of its grain and unique key. The outbox processor reads it
--   from v2_usage_overview_requests when it rebuilds a workspace hour; nothing new runs per request.
-- * workspace_settings.department_spend_attribution ('all' | 'primary').
-- * private.spend_scope_departments applies the department rule; private.spend_department_totals
--   totals spend per department over a range in one query.
-- Backfill: rows already rolled up get their actor from keys for the current and previous calendar
-- month (what calendar, previous-period and 30-day rolling rules read). OAuth-token rows there, and
-- every older row, keep a null actor until their hour is rebuilt; older periods attribute by key.
-- phaseo:allow-destructive-migration reason: the replaced outbox processor deletes and rebuilds only derived rollup rows and truncates its temporary batch tables, as before; this migration deletes no rows, only drops and rebuilds the rollup's unique index and fills the new actor column.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

ALTER TABLE "public"."workspace_settings"
  ADD COLUMN "department_spend_attribution" text NOT NULL DEFAULT 'all'::text;

ALTER TABLE "public"."workspace_settings"
  ADD CONSTRAINT "workspace_settings_department_spend_attribution_check" CHECK ((department_spend_attribution = ANY (ARRAY['all'::text, 'primary'::text])));

COMMENT ON COLUMN "public"."workspace_settings"."department_spend_attribution" IS 'How spend rules count a person''s spend toward departments when their key has no department: all (every department they belong to) or primary (only their primary one). A key''s own department always wins. See private.spend_scope_departments.';

ALTER TABLE "public"."v2_private_usage_15m"
  ADD COLUMN "actor_user_id" uuid;

-- Rebuilt below with the actor in the key. Dropped first so the backfill updates no index.
DROP INDEX "public"."v2_private_usage_15m_key";

-- Bounded backfill: two calendar months at most. Keys map to one actor each, so the old unique
-- grain stays unique with the actor added.
UPDATE public.v2_private_usage_15m rollup
SET actor_user_id = COALESCE(key.oauth_user_id, key.created_by)
FROM public.keys key
WHERE key.id = rollup.key_id
  AND rollup.bucket_start >= date_trunc('month', now() - interval '1 month', 'UTC');

CREATE UNIQUE INDEX v2_private_usage_15m_key ON public.v2_private_usage_15m
  USING btree
  (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id) NULLS NOT DISTINCT;

COMMENT ON COLUMN "public"."v2_private_usage_15m"."actor_user_id" IS 'Who made the requests, as v2_usage_overview_requests resolves it: the OAuth user for OAuth tokens, otherwise the key''s OAuth user or creator. Null when unknown. Rows from before this column existed were backfilled from keys for the current and previous calendar month only; older rows have no actor until their hour is rebuilt.';

COMMENT ON TABLE "public"."v2_private_usage_15m" IS 'Exact workspace usage per 15 minutes for the usage overview and spend rules, by model, route, key, app, BYOK and actor. Rebuilt per workspace hour by process_v2_analytics_outbox. Excludes async job endpoints, as the overview does. Service role only: the account route checks workspace membership.';

-- Appends actor_user_id; the existing columns are unchanged.
CREATE OR REPLACE VIEW "private"."v2_usage_overview_requests" WITH (security_invoker=true) AS  SELECT fact.request_event_id,
    fact.workspace_id,
    fact.occurred_at,
    COALESCE(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) AS model_id,
    fact.provider_model_id,
    fact.key_id,
    fact.app_id,
    COALESCE(fact.byok, false) AS byok,
    (fact.success IS TRUE) AS successful,
    COALESCE((fact.error_code ~~ '%:guardrail_blocked'::text), false) AS guardrail_blocked,
    COALESCE(fact.cost_nanos, (0)::bigint) AS cost_nanos,
    COALESCE(usage.total_tokens, (usage.input_tokens + usage.output_tokens)) AS tokens,
    usage.input_tokens,
    usage.output_tokens,
    usage.reasoning_tokens,
    usage.cached_tokens,
        CASE
            WHEN (jsonb_typeof((fact.safe_metadata -> 'labels'::text)) = 'array'::text) THEN (fact.safe_metadata -> 'labels'::text)
            ELSE '[]'::jsonb
        END AS labels,
    COALESCE(
        CASE
            WHEN (fact.auth_method = 'oauth'::text) THEN ( SELECT request.oauth_user_id
               FROM public.gateway_requests request
              WHERE ((request.id = fact.gateway_request_id) AND (request.created_at = fact.gateway_request_created_at)))
            ELSE NULL::uuid
        END, key.oauth_user_id, key.created_by) AS actor_user_id
   FROM ((public.v2_request_facts fact
     LEFT JOIN public.keys key ON ((key.id = fact.key_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'prompt_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_text_tokens'::text)), (0)::numeric) AS input_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'completion_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_text_tokens'::text)), (0)::numeric) AS output_tokens,
            sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'total_tokens'::text)) AS total_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'reasoning_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_reasoning_tokens'::text)), (0)::numeric) AS reasoning_tokens,
            (COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_text_tokens'::text)), (0)::numeric) + COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_text_tokens'::text)), (0)::numeric)) AS cached_tokens
           FROM public.v2_request_usage meter
          WHERE (meter.request_event_id = fact.request_event_id)) usage ON (true))
  WHERE (COALESCE(fact.endpoint, ''::text) <> ALL (ARRAY['video.generation'::text, 'batch'::text, 'music.generate'::text]));

GRANT SELECT ON TABLE "private"."v2_usage_overview_requests" TO "service_role";

COMMENT ON VIEW "private"."v2_usage_overview_requests" IS 'One row per request as the usage overview counts it: the resolved model, tokens as the reported total or input plus output, cached reads and writes (one alias each, since the gateway writes the same count under several), guardrail blocks, request labels, and the actor spend rules attribute it to (the OAuth user for OAuth tokens, otherwise the key''s OAuth user or creator; read at rollup time, never on the request path). Async job endpoints are left out; their own pages count them. Feeds the 15-minute rollups and the requests at the edges of get_private_usage_overview.';

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

COMMENT ON FUNCTION "public"."process_v2_analytics_outbox"(integer) IS 'Serializes summary rebuilds, claims a bounded seed batch, and coalesces covered workspace/hour events before idempotent private daily, public daily, public hourly, and usage overview 15-minute rebuilds; the 15-minute and label rollups are rebuilt per touched workspace hour. At most 2000 acknowledgments per run; corrections retain row locks and re-enqueue after commit.';

REVOKE ALL ON FUNCTION "public"."process_v2_analytics_outbox"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."process_v2_analytics_outbox"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."process_v2_analytics_outbox"(integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.spend_scope_departments (
  p_workspace_id  uuid,
  p_key_id        uuid,
  p_actor_user_id uuid
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The departments spend rules count one key and actor's spend toward, as of now:
  -- 1. A standard key's own department wins.
  -- 2. Otherwise the actor's (the key's creator or the OAuth user): a manual override on
  --    workspace_member_overrides replaces their directory departments, as it does for their
  --    entitlements (an override with no department means none).
  -- 3. Otherwise every department in workspace_department_grants, or with
  --    workspace_settings.department_spend_attribution = 'primary' only the one their
  --    entitlements pick: the primary grant, then manual over SCIM, then the oldest.
  -- OAuth-delegated keys always use the user, as keys.department_id documents.
  -- Membership is read at call time, so moving someone moves their spend for the period.
  with explicit as (
    select key.department_id
    from public.keys key
    where key.id = p_key_id
      and key.workspace_id = p_workspace_id
      and key.key_kind = 'standard'
      and key.department_id is not null
  ),
  override as (
    select override.department_id
    from public.workspace_member_overrides override
    where override.workspace_id = p_workspace_id
      and override.user_id = p_actor_user_id
      and override.department_override_enabled
  ),
  grants as (
    select grant_row.department_id,
      row_number() over (
        order by grant_row.is_primary desc, (grant_row.source_type = 'manual') desc, grant_row.created_at, grant_row.department_id
      ) as rank
    from public.workspace_department_grants grant_row
    where grant_row.workspace_id = p_workspace_id
      and grant_row.user_id = p_actor_user_id
  ),
  primary_only as (
    select coalesce((
      select settings.department_spend_attribution = 'primary'
      from public.workspace_settings settings
      where settings.workspace_id = p_workspace_id
    ), false) as value
  )
  select explicit.department_id from explicit
  union
  select override.department_id from override
  where override.department_id is not null
    and not exists (select 1 from explicit)
  union
  select grants.department_id from grants, primary_only
  where not exists (select 1 from explicit)
    and not exists (select 1 from override)
    and (not primary_only.value or grants.rank = 1);
$function$;

COMMENT ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) IS 'Departments that spend by one key and actor counts toward for spend rules: a standard key''s own department, else the actor''s override department, else all their departments (or only the primary one when workspace_settings.department_spend_attribution is primary). Empty when none apply.';

REVOKE ALL ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_department_totals (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS TABLE (
    department_id uuid,
    cost_nanos    numeric,
    requests      bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Spend per department from p_from (inclusive) to p_to (exclusive), in one query for spend
  -- rules. Usage is summed per key and actor first, then each pair is spread over the
  -- departments private.spend_scope_departments gives it, so a person in two departments
  -- counts in full toward both (unless the workspace counts primary departments only).
  -- Whole quarter hours from v2_private_usage_15m, plus async jobs and realtime sessions
  -- from gateway_requests as sweep_spend_limit_warnings adds them. Like that sweep, it reads
  -- the rollup as it stands: hours the outbox has yet to rebuild count late.
  with usage as (
    select usage.key_id, usage.actor_user_id, sum(usage.cost_nanos) as cost_nanos, sum(usage.requests)::bigint as requests
    from (
      select rollup.key_id, rollup.actor_user_id, rollup.cost_nanos, rollup.requests
      from public.v2_private_usage_15m rollup
      where rollup.workspace_id = p_workspace_id
        and rollup.bucket_start >= p_from
        and rollup.bucket_start < p_to
      union all
      -- gateway_requests_async_spend_idx
      select request.key_id, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by),
        coalesce(request.cost_nanos, 0)::numeric, 1::bigint
      from public.gateway_requests request
      left join public.keys key on key.id = request.key_id
      where request.success is true
        and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
        and request.workspace_id = p_workspace_id
        and request.created_at >= p_from
        and request.created_at < p_to
    ) usage
    group by usage.key_id, usage.actor_user_id
  )
  select scope.department_id, sum(usage.cost_nanos), sum(usage.requests)::bigint
  from usage
  cross join lateral private.spend_scope_departments(p_workspace_id, usage.key_id, usage.actor_user_id) scope(department_id)
  group by scope.department_id;
$function$;

COMMENT ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) IS 'Spend and requests per department for a workspace over [p_from, p_to), attributed by private.spend_scope_departments. Spend with no department is left out; a person in several departments counts toward each unless the workspace counts primary departments only.';

REVOKE ALL ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_department_totals"(uuid, timestamp with time zone, timestamp with time zone) TO "service_role";
