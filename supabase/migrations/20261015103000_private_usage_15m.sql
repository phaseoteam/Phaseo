-- Exact 15-minute workspace usage for the usage overview, overall and per request
-- label, so its figures, charts, label filter and forecasts no longer come from a
-- 5,000-request sample. The outbox processor keeps both rollups current;
-- get_private_usage_overview and get_private_usage_label_facets read them, plus the
-- requests at the edges of the window that they don't cover.
SET local check_function_bodies = off;

-- Hold the outbox processor until this commits, so no request is acknowledged by the
-- old processor between the backfill below and the new one taking over.
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('public.process_v2_analytics_outbox', 0));

CREATE TABLE "public"."v2_private_usage_15m" (
  "workspace_id"       uuid                     NOT NULL,
  "bucket_start"       timestamp with time zone NOT NULL,
  "model_id"           text,
  "provider_model_id"  text,
  "key_id"             uuid,
  "app_id"             uuid,
  "byok"               boolean                  NOT NULL DEFAULT false,
  "requests"           bigint                   NOT NULL DEFAULT 0,
  "successful_requests" bigint                   NOT NULL DEFAULT 0,
  "guardrail_blocked"  bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"         numeric(30,0)            NOT NULL DEFAULT 0,
  "tokens"             numeric(30,12)           NOT NULL DEFAULT 0,
  "input_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "output_tokens"      numeric(30,12)           NOT NULL DEFAULT 0,
  "reasoning_tokens"   numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_tokens"      numeric(30,12)           NOT NULL DEFAULT 0,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_private_usage_15m"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_private_usage_15m_key ON public.v2_private_usage_15m
  USING btree
  (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok) NULLS NOT DISTINCT;

REVOKE ALL ON TABLE "public"."v2_private_usage_15m" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_private_usage_15m" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_private_usage_15m" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."v2_private_usage_15m" IS 'Exact workspace usage per 15 minutes for the usage overview, by model, route, key, app and BYOK. Rebuilt per workspace hour by process_v2_analytics_outbox. Excludes async job endpoints, as the overview does. Service role only: the account route checks workspace membership.';

CREATE TABLE "public"."v2_private_usage_labels_15m" (
  "workspace_id"        uuid                     NOT NULL,
  "bucket_start"        timestamp with time zone NOT NULL,
  "label_key"           text                     NOT NULL,
  "label_value"         text                     NOT NULL,
  "model_id"            text,
  "provider_model_id"   text,
  "key_id"              uuid,
  "app_id"              uuid,
  "byok"                boolean                  NOT NULL DEFAULT false,
  "requests"            bigint                   NOT NULL DEFAULT 0,
  "successful_requests" bigint                   NOT NULL DEFAULT 0,
  "guardrail_blocked"   bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"          numeric(30,0)            NOT NULL DEFAULT 0,
  "tokens"              numeric(30,12)           NOT NULL DEFAULT 0,
  "input_tokens"        numeric(30,12)           NOT NULL DEFAULT 0,
  "output_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "reasoning_tokens"    numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_private_usage_labels_15m_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_private_usage_labels_15m"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_private_usage_labels_15m_key ON public.v2_private_usage_labels_15m
  USING btree
  (workspace_id, label_key, label_value, bucket_start, model_id, provider_model_id, key_id, app_id, byok) NULLS NOT DISTINCT;

CREATE INDEX v2_private_usage_labels_15m_workspace_time_idx ON public.v2_private_usage_labels_15m USING btree (workspace_id, bucket_start);

REVOKE ALL ON TABLE "public"."v2_private_usage_labels_15m" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_private_usage_labels_15m" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_private_usage_labels_15m" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."v2_private_usage_labels_15m" IS 'Exact workspace usage per 15 minutes and request label, by model, route, key, app and BYOK, for the usage overview''s label filter and label list. A request counts once under each of its labels. Rebuilt per workspace hour by process_v2_analytics_outbox alongside v2_private_usage_15m. Service role only: the account routes check workspace membership.';

CREATE VIEW "private"."v2_usage_overview_requests" WITH (security_invoker=true) AS  SELECT fact.request_event_id,
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
        END AS labels
   FROM (public.v2_request_facts fact
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'prompt_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'input_text_tokens'::text)), (0)::numeric) AS input_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'completion_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_text_tokens'::text)), (0)::numeric) AS output_tokens,
            sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'total_tokens'::text)) AS total_tokens,
            COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'reasoning_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'output_reasoning_tokens'::text)), (0)::numeric) AS reasoning_tokens,
            (COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_input_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_read_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_read_text_tokens'::text)), (0)::numeric) + COALESCE(sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cache_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_tokens'::text)), sum(meter.quantity) FILTER (WHERE (meter.meter_key = 'cached_write_text_tokens'::text)), (0)::numeric)) AS cached_tokens
           FROM public.v2_request_usage meter
          WHERE (meter.request_event_id = fact.request_event_id)) usage ON (true))
  WHERE (COALESCE(fact.endpoint, ''::text) <> ALL (ARRAY['video.generation'::text, 'batch'::text, 'music.generate'::text]));

GRANT SELECT ON TABLE "private"."v2_usage_overview_requests" TO "service_role";

COMMENT ON VIEW "private"."v2_usage_overview_requests" IS 'One row per request as the usage overview counts it: the resolved model, tokens as the reported total or input plus output, cached reads and writes (one alias each, since the gateway writes the same count under several), guardrail blocks and request labels. Async job endpoints are left out; their own pages count them. Feeds the 15-minute rollups and the requests at the edges of get_private_usage_overview.';

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
  -- from the same view.
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
        workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok,
        requests, successful_requests, guardrail_blocked, cost_nanos,
        tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
      )
      select
        grain.workspace_id, request.bucket_start, request.model_id, request.provider_model_id,
        request.key_id, request.app_id, request.byok,
        count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
        sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
        sum(request.reasoning_tokens), sum(request.cached_tokens)
      from requests request
      group by 2, 3, 4, 5, 6, 7
    )
    insert into public.v2_private_usage_labels_15m (
      workspace_id, bucket_start, label_key, label_value, model_id, provider_model_id, key_id, app_id, byok,
      requests, successful_requests, guardrail_blocked, cost_nanos,
      tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
    )
    select
      grain.workspace_id, request.bucket_start, label.value ->> 'key', label.value ->> 'value',
      request.model_id, request.provider_model_id, request.key_id, request.app_id, request.byok,
      count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
      sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
      sum(request.reasoning_tokens), sum(request.cached_tokens)
    from requests request
    cross join lateral jsonb_array_elements(request.labels) label
    where jsonb_typeof(label.value -> 'key') = 'string' and jsonb_typeof(label.value -> 'value') = 'string'
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

CREATE OR REPLACE FUNCTION private.enqueue_v2_analytics_fact_correction()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if coalesce(current_setting('phaseo.pruning_byok_metadata',true),'')='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  -- Queue the old hour even without a model slug: the usage overview rebuilds whole
  -- workspace hours and counts requests that only name their input model.
  if (tg_op='DELETE' or row(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc'),old.app_id,
    coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    is distinct from row(new.workspace_id,date_trunc('hour',new.occurred_at at time zone 'utc'),new.app_id,
    coalesce(new.routed_model_slug,new.requested_model_slug),new.provider_model_id,new.cloudflare_colo)) then
    insert into private.v2_analytics_previous_grains as queued(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
    values(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc') at time zone 'utc',old.app_id,
      coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    on conflict(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo) do update
    set grain_id=excluded.grain_id,transaction_id=excluded.transaction_id
    where queued.transaction_id<>excluded.transaction_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if old is distinct from new then perform private.enqueue_v2_analytics_correction(new.request_event_id); end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_v2_analytics_fact_correction"() TO "postgres";

CREATE OR REPLACE FUNCTION public.get_private_usage_overview (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_bucket       text                     DEFAULT NULL::text,
  p_time_zone    text                     DEFAULT 'UTC'::text,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_label_key    text                     DEFAULT NULL::text,
  p_label_value  text                     DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Exact usage overview figures for a workspace from p_from to p_to inclusive: one entry
-- per time bucket (5 minutes, or an hour, day or month in p_time_zone; none when
-- p_bucket is null), model, provider, key, app and BYOK. With a label, only requests
-- carrying it.
-- Whole quarter hours come from v2_private_usage_15m, or v2_private_usage_labels_15m
-- for a label. The minutes outside them, and the latest half hour, which the rollups
-- may not have caught up with yet, come from v2_usage_overview_requests, which the
-- rollups are built from. 5-minute buckets read requests only.
-- Service role only: the account routes check workspace membership before calling it.
with bounds as (
  select
    rolled.rolled_from,
    rolled.rolled_to,
    rolled.rolled_from is not null and rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      case when p_bucket is distinct from '5 minutes'
        then date_bin('15 minutes', p_from - interval '1 microsecond', timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes'
      end as rolled_from,
      date_bin('15 minutes', p_to, timestamptz '2000-01-01 00:00:00+00') - interval '15 minutes' as rolled_to
  ) rolled
),
raw_ranges as (
  select p_from as range_from, p_to + interval '1 microsecond' as range_to from bounds where not bounds.use_rollup
  union all
  select p_from, bounds.rolled_from from bounds where bounds.use_rollup and bounds.rolled_from > p_from
  union all
  select bounds.rolled_to, p_to + interval '1 microsecond' from bounds where bounds.use_rollup
),
usage_rows as (
  select
    request.occurred_at as at,
    request.model_id,
    request.provider_model_id,
    request.key_id,
    request.app_id,
    request.byok,
    1::bigint as requests,
    request.successful::integer::bigint as successful_requests,
    request.guardrail_blocked::integer::bigint as guardrail_blocked,
    request.cost_nanos::numeric as cost_nanos,
    request.tokens,
    request.input_tokens,
    request.output_tokens,
    request.reasoning_tokens,
    request.cached_tokens
  from raw_ranges
  join private.v2_usage_overview_requests request
    on request.workspace_id = p_workspace_id
    and request.occurred_at >= raw_ranges.range_from
    and request.occurred_at < raw_ranges.range_to
  where p_label_key is null
    or request.labels @> jsonb_build_array(jsonb_build_object('key', p_label_key, 'value', p_label_value))
  union all
  select
    rollup.bucket_start, rollup.model_id, rollup.provider_model_id, rollup.key_id, rollup.app_id, rollup.byok,
    rollup.requests, rollup.successful_requests, rollup.guardrail_blocked, rollup.cost_nanos,
    rollup.tokens, rollup.input_tokens, rollup.output_tokens, rollup.reasoning_tokens, rollup.cached_tokens
  from bounds
  join public.v2_private_usage_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup and p_label_key is null
  union all
  select
    rollup.bucket_start, rollup.model_id, rollup.provider_model_id, rollup.key_id, rollup.app_id, rollup.byok,
    rollup.requests, rollup.successful_requests, rollup.guardrail_blocked, rollup.cost_nanos,
    rollup.tokens, rollup.input_tokens, rollup.output_tokens, rollup.reasoning_tokens, rollup.cached_tokens
  from bounds
  join public.v2_private_usage_labels_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.label_key = p_label_key
    and rollup.label_value = p_label_value
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup and p_label_key is not null
),
filtered as (
  select usage_rows.*
  from usage_rows
  where (p_key_id is null or case when p_exclude_key
      then usage_rows.key_id is distinct from p_key_id
      else usage_rows.key_id = p_key_id end)
    and (p_creator_id is null or exists (
      select 1 from public.keys key
      where key.id = usage_rows.key_id
        and key.workspace_id = p_workspace_id
        and key.created_by = p_creator_id
    ))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'bucket', cell.bucket,
  'modelId', cell.model_id,
  'provider', cell.provider,
  'keyId', cell.key_id,
  'appId', cell.app_id,
  'byok', cell.byok,
  'requests', cell.requests,
  'successfulRequests', cell.successful_requests,
  'guardrailBlocked', cell.guardrail_blocked,
  'costNanos', cell.cost_nanos,
  'tokens', cell.tokens,
  'inputTokens', cell.input_tokens,
  'outputTokens', cell.output_tokens,
  'reasoningTokens', cell.reasoning_tokens,
  'cachedTokens', cell.cached_tokens
) order by cell.bucket, cell.requests desc), '[]'::jsonb)
from (
  select
    case p_bucket
      when '5 minutes' then date_bin('5 minutes', filtered.at, timestamptz '2000-01-01 00:00:00+00')
      when 'hour' then date_trunc('hour', filtered.at, p_time_zone)
      when 'day' then date_trunc('day', filtered.at, p_time_zone)
      when 'month' then date_trunc('month', filtered.at, p_time_zone)
    end as bucket,
    filtered.model_id,
    route.provider_slug as provider,
    filtered.key_id,
    filtered.app_id,
    filtered.byok,
    sum(filtered.requests) as requests,
    sum(filtered.successful_requests) as successful_requests,
    sum(filtered.guardrail_blocked) as guardrail_blocked,
    round(sum(filtered.cost_nanos)) as cost_nanos,
    round(sum(filtered.tokens)) as tokens,
    round(sum(filtered.input_tokens)) as input_tokens,
    round(sum(filtered.output_tokens)) as output_tokens,
    round(sum(filtered.reasoning_tokens)) as reasoning_tokens,
    round(sum(filtered.cached_tokens)) as cached_tokens
  from filtered
  left join public.v2_model_provider_routes route on route.provider_model_id = filtered.provider_model_id
  group by 1, 2, 3, 4, 5, 6
) cell;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_private_usage_label_facets (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_limit        integer                  DEFAULT 500
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- The request labels a workspace used from p_from to p_to inclusive, with how many
-- requests carried each, for the usage overview's label filter: the most used first,
-- at most p_limit. Whole quarter hours come from v2_private_usage_labels_15m and the
-- minutes outside them, and the latest half hour, from v2_usage_overview_requests, as
-- in get_private_usage_overview.
-- Service role only: the account routes check workspace membership before calling it.
with bounds as (
  select
    rolled.rolled_from,
    rolled.rolled_to,
    rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      date_bin('15 minutes', p_from - interval '1 microsecond', timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes' as rolled_from,
      date_bin('15 minutes', p_to, timestamptz '2000-01-01 00:00:00+00') - interval '15 minutes' as rolled_to
  ) rolled
),
raw_ranges as (
  select p_from as range_from, p_to + interval '1 microsecond' as range_to from bounds where not bounds.use_rollup
  union all
  select p_from, bounds.rolled_from from bounds where bounds.use_rollup and bounds.rolled_from > p_from
  union all
  select bounds.rolled_to, p_to + interval '1 microsecond' from bounds where bounds.use_rollup
),
label_rows as (
  select label.value ->> 'key' as label_key, label.value ->> 'value' as label_value, request.key_id, 1::bigint as requests
  from raw_ranges
  join private.v2_usage_overview_requests request
    on request.workspace_id = p_workspace_id
    and request.occurred_at >= raw_ranges.range_from
    and request.occurred_at < raw_ranges.range_to
  cross join lateral jsonb_array_elements(request.labels) label
  where jsonb_typeof(label.value -> 'key') = 'string' and jsonb_typeof(label.value -> 'value') = 'string'
  union all
  select rollup.label_key, rollup.label_value, rollup.key_id, rollup.requests
  from bounds
  join public.v2_private_usage_labels_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup
),
facets as (
  select label_rows.label_key, label_rows.label_value, sum(label_rows.requests) as requests
  from label_rows
  where (p_key_id is null or case when p_exclude_key
      then label_rows.key_id is distinct from p_key_id
      else label_rows.key_id = p_key_id end)
    and (p_creator_id is null or exists (
      select 1 from public.keys key
      where key.id = label_rows.key_id
        and key.workspace_id = p_workspace_id
        and key.created_by = p_creator_id
    ))
  group by 1, 2
  order by 3 desc, 1, 2
  limit greatest(0, least(coalesce(p_limit, 500), 500))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'key', facets.label_key,
  'value', facets.label_value,
  'requests', facets.requests
) order by facets.requests desc, facets.label_key, facets.label_value), '[]'::jsonb)
from facets;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone, uuid, boolean, uuid, integer) FROM PUBLIC, "anon", "authenticated";

-- Backfill every request so far, from the view the outbox processor builds the rollups from.
with requests as materialized (
  select request.*, date_bin('15 minutes', request.occurred_at, timestamptz '2000-01-01 00:00:00+00') as bucket_start
  from private.v2_usage_overview_requests request
), totals as (
  insert into public.v2_private_usage_15m (
    workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok,
    requests, successful_requests, guardrail_blocked, cost_nanos,
    tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
  )
  select
    request.workspace_id, request.bucket_start, request.model_id, request.provider_model_id,
    request.key_id, request.app_id, request.byok,
    count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
    sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
    sum(request.reasoning_tokens), sum(request.cached_tokens)
  from requests request
  group by 1, 2, 3, 4, 5, 6, 7
)
insert into public.v2_private_usage_labels_15m (
  workspace_id, bucket_start, label_key, label_value, model_id, provider_model_id, key_id, app_id, byok,
  requests, successful_requests, guardrail_blocked, cost_nanos,
  tokens, input_tokens, output_tokens, reasoning_tokens, cached_tokens
)
select
  request.workspace_id, request.bucket_start, label.value ->> 'key', label.value ->> 'value',
  request.model_id, request.provider_model_id, request.key_id, request.app_id, request.byok,
  count(*), count(*) filter (where request.successful), count(*) filter (where request.guardrail_blocked),
  sum(request.cost_nanos), sum(request.tokens), sum(request.input_tokens), sum(request.output_tokens),
  sum(request.reasoning_tokens), sum(request.cached_tokens)
from requests request
cross join lateral jsonb_array_elements(request.labels) label
where jsonb_typeof(label.value -> 'key') = 'string' and jsonb_typeof(label.value -> 'value') = 'string'
group by 1, 2, 3, 4, 5, 6, 7, 8, 9;
