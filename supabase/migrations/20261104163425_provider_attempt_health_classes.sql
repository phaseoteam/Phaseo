-- Provider uptime split for model pages: reachability, capacity and call errors, per attempt.
--
-- 1. v2_request_attempts.health_class: what each attempt says about its provider. The gateway
--    classifies every attempt (apps/api/src/pipeline/execute/attempt-health.ts): success,
--    reachability, capacity, call_error (provider failures), customer or phaseo (excluded).
--    Nullable; rows recorded before this change stay null and are classified best-effort on read.
-- 2. ingest_v2_gateway_request stores the attempt's health_class when it is one of those values.
--    The deployed definition is patched at the attempts insert only, so edits to other sections
--    of the function (for example pricing lines) are preserved.
-- 3. get_v2_model_provider_attempt_health: per provider, service tier and hour for a public model.
--    Read-only and service-role only, like the sibling model-page health functions.
-- The table is small (about 220k rows); a nullable column with a CHECK takes a short lock.

SET local check_function_bodies = off;

ALTER TABLE "public"."v2_request_attempts"
  ADD COLUMN "health_class" text;

ALTER TABLE "public"."v2_request_attempts"
  ADD CONSTRAINT "v2_request_attempts_health_class_check" CHECK (((health_class IS NULL) OR (health_class = ANY (ARRAY['success'::text, 'reachability'::text, 'capacity'::text, 'call_error'::text, 'customer'::text, 'phaseo'::text]))));

COMMENT ON COLUMN "public"."v2_request_attempts"."health_class" IS 'What the attempt says about its provider: success, reachability, capacity or call_error (provider failures), or customer / phaseo (excluded from provider metrics). Null on rows recorded before the gateway classified attempts.';

do $migration$
declare
  definition text := pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure);
  column_anchor text := $anchor$    error_code, failure_class, upstream_response_id, latency_ms, cloudflare_colo, safe_metadata
  )$anchor$;
  column_replacement text := $replacement$    error_code, failure_class, upstream_response_id, latency_ms, cloudflare_colo, safe_metadata,
    health_class
  )$replacement$;
  value_anchor text := $anchor$      'was_probe', coalesce((item.value->>'was_probe')::boolean, false)
    ))
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$anchor$;
  value_replacement text := $replacement$      'was_probe', coalesce((item.value->>'was_probe')::boolean, false)
    )),
    case
      when item.value->>'health_class' in ('success', 'reachability', 'capacity', 'call_error', 'customer', 'phaseo')
      then item.value->>'health_class'
    end
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$replacement$;
begin
  -- The anchors are LF-only, whatever line endings this file was checked out with.
  column_anchor := replace(column_anchor, chr(13), '');
  column_replacement := replace(column_replacement, chr(13), '');
  value_anchor := replace(value_anchor, chr(13), '');
  value_replacement := replace(value_replacement, chr(13), '');
  if strpos(definition, 'health_class') > 0 then
    raise exception 'Attempt health_class ingestion is already installed';
  end if;
  if (length(definition) - length(replace(definition, column_anchor, ''))) / length(column_anchor) <> 1 then
    raise exception 'Expected exactly one attempts insert column list';
  end if;
  if (length(definition) - length(replace(definition, value_anchor, ''))) / length(value_anchor) <> 1 then
    raise exception 'Expected exactly one attempts safe_metadata value';
  end if;
  execute replace(replace(definition, column_anchor, column_replacement), value_anchor, value_replacement);
end;
$migration$;

CREATE OR REPLACE FUNCTION public.get_v2_model_provider_attempt_health (
  p_model_slug  text,
  p_window_days integer DEFAULT 3
)
  RETURNS TABLE (
    provider_id           text,
    service_tier          text,
    provider_name         text,
    attempts              bigint,
    eligible_attempts     bigint,
    success_attempts      bigint,
    reachability_failures bigint,
    capacity_failures     bigint,
    call_error_failures   bigint,
    customer_excluded     bigint,
    phaseo_excluded       bigint,
    reachability_pct      numeric,
    capacity_pct          numeric,
    call_error_pct        numeric,
    uptime_pct            numeric,
    buckets               jsonb,
    last_attempt_at       timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Provider health per ATTEMPT, attributed to the provider each attempt went
  -- to: a failed attempt counts against its provider even when the request
  -- later succeeded elsewhere. rate_X = 1 - failures_X / eligible_attempts,
  -- where eligible attempts exclude customer- and Phaseo-caused failures.
  -- customer_excluded / phaseo_excluded are for internal use only.
  with params as (
    select
      model.model_slug,
      greatest(1, least(coalesce(p_window_days, 3), 90))::integer as window_days,
      now() as now_ts
    from public.v2_models model
    where model.model_slug = lower(trim(p_model_slug))
      and model.hidden = false
      and model.status <> 'disabled'
  ),
  -- Each attempt's own route must be publicly reportable (not hidden,
  -- disabled, internal or stealth), not only the route that served. Checked
  -- once per route rather than once per attempt.
  visible_routes as materialized (
    select route.provider_model_id, route.provider_slug
    from public.v2_model_provider_routes route
    join params on route.model_slug = params.model_slug
    where public.public_reporting_route_is_visible(params.model_slug, route.provider_model_id)
  ),
  -- Materialized so the plan starts from this model's facts in the window
  -- (model/time index) and reaches attempts by request id.
  facts as materialized (
    select
      fact.request_event_id,
      fact.occurred_at,
      coalesce(fact.service_tier_slug, 'standard') as service_tier,
      lower(coalesce(fact.error_code, '')) as fact_error_code,
      nullif(lower(trim(fact.stop_reason)), '') as fact_stop_reason
    from public.v2_request_facts fact
    join params on true
    where coalesce(fact.routed_model_slug, fact.requested_model_slug) = params.model_slug
      and fact.occurred_at >= params.now_ts - make_interval(days => params.window_days)
      and fact.public_reporting_allowed
  ),
  request_attempts as (
    select
      fact.*,
      attempt.provider_model_id,
      attempt.health_class as recorded_class,
      attempt.success,
      attempt.status_code,
      attempt.failure_class,
      lower(coalesce(attempt.safe_metadata->>'key_source', 'gateway')) as key_source,
      -- The served attempt is the request's last successful one.
      attempt.success and attempt.attempt_number = max(attempt.attempt_number)
        filter (where attempt.success) over (partition by attempt.request_event_id) as is_served
    from facts fact
    join public.v2_request_attempts attempt on attempt.request_event_id = fact.request_event_id
  ),
  attempt_rows as (
    select route.provider_slug as provider_id, request_attempts.*
    from request_attempts
    join visible_routes route on route.provider_model_id = request_attempts.provider_model_id
  ),
  classified as (
    select
      r.provider_id,
      r.service_tier,
      r.occurred_at,
      -- Rows recorded before the gateway classified attempts (health_class null)
      -- get a best-effort class from what was persisted. Approximations:
      --   * no provider error body was stored, so a 503 is always reachability
      --     (never capacity) and a 403 on the managed key is always phaseo;
      --   * thrown errors had no transport flag: retryable ones count as
      --     reachability, others as phaseo;
      --   * a served stream that broke is a call error, including client
      --     cancellations recorded as upstream_stream_failure before the
      --     gateway told the two apart.
      coalesce(r.recorded_class, case
        when r.failure_class in ('blocked', 'no_pricing', 'unsupported_executor') then 'phaseo'
        when r.success then case
          when r.is_served and r.fact_error_code like 'client:%' then 'customer'
          when r.is_served and (
            r.fact_error_code in ('upstream:upstream_stream_failure', 'gateway:google_empty_response', 'gateway:normalization_failed')
            or r.fact_stop_reason = 'error'
          ) then 'call_error'
          else 'success'
        end
        when r.key_source = 'byok' and r.status_code in (401, 402, 403, 429) then 'customer'
        when r.status_code in (429, 529) then 'capacity'
        when r.status_code = 408 then 'reachability'
        when r.status_code in (401, 402, 403) then 'phaseo'
        when r.status_code between 400 and 499 then 'customer'
        when r.status_code in (502, 503, 504) or r.status_code between 520 and 527 then 'reachability'
        when r.status_code between 500 and 599 then 'call_error'
        when r.status_code between 200 and 299 then 'success'
        when r.failure_class = 'retryable_error' then 'reachability'
        else 'phaseo'
      end) as health_class
    from attempt_rows r
  ),
  hourly as (
    select
      c.provider_id,
      c.service_tier,
      date_trunc('hour', c.occurred_at) as bucket_start,
      count(*)::bigint as attempts,
      count(*) filter (where c.health_class in ('success', 'reachability', 'capacity', 'call_error'))::bigint as eligible_attempts,
      count(*) filter (where c.health_class = 'success')::bigint as success_attempts,
      count(*) filter (where c.health_class = 'reachability')::bigint as reachability_failures,
      count(*) filter (where c.health_class = 'capacity')::bigint as capacity_failures,
      count(*) filter (where c.health_class = 'call_error')::bigint as call_error_failures,
      count(*) filter (where c.health_class = 'customer')::bigint as customer_excluded,
      count(*) filter (where c.health_class = 'phaseo')::bigint as phaseo_excluded,
      max(c.occurred_at) as last_attempt_at
    from classified c
    group by c.provider_id, c.service_tier, date_trunc('hour', c.occurred_at)
  ),
  totals as (
    select
      h.provider_id,
      h.service_tier,
      sum(h.attempts)::bigint as attempts,
      sum(h.eligible_attempts)::bigint as eligible_attempts,
      sum(h.success_attempts)::bigint as success_attempts,
      sum(h.reachability_failures)::bigint as reachability_failures,
      sum(h.capacity_failures)::bigint as capacity_failures,
      sum(h.call_error_failures)::bigint as call_error_failures,
      sum(h.customer_excluded)::bigint as customer_excluded,
      sum(h.phaseo_excluded)::bigint as phaseo_excluded,
      jsonb_agg(jsonb_build_object(
        'start', h.bucket_start,
        'end', h.bucket_start + interval '1 hour',
        'attempts', h.attempts,
        'eligible_attempts', h.eligible_attempts,
        'success_attempts', h.success_attempts,
        'reachability_failures', h.reachability_failures,
        'capacity_failures', h.capacity_failures,
        'call_error_failures', h.call_error_failures,
        'customer_excluded', h.customer_excluded,
        'phaseo_excluded', h.phaseo_excluded,
        'reachability_pct', case when h.eligible_attempts > 0 then round((1 - h.reachability_failures::numeric / h.eligible_attempts) * 100, 2) end,
        'capacity_pct', case when h.eligible_attempts > 0 then round((1 - h.capacity_failures::numeric / h.eligible_attempts) * 100, 2) end,
        'call_error_pct', case when h.eligible_attempts > 0 then round((1 - h.call_error_failures::numeric / h.eligible_attempts) * 100, 2) end,
        'uptime_pct', case when h.eligible_attempts > 0 then round(h.success_attempts::numeric / h.eligible_attempts * 100, 2) end
      ) order by h.bucket_start) as buckets,
      max(h.last_attempt_at) as last_attempt_at
    from hourly h
    group by h.provider_id, h.service_tier
  )
  select
    t.provider_id,
    t.service_tier,
    coalesce(provider.name, t.provider_id) as provider_name,
    t.attempts,
    t.eligible_attempts,
    t.success_attempts,
    t.reachability_failures,
    t.capacity_failures,
    t.call_error_failures,
    t.customer_excluded,
    t.phaseo_excluded,
    case when t.eligible_attempts > 0 then round((1 - t.reachability_failures::numeric / t.eligible_attempts) * 100, 2) end as reachability_pct,
    case when t.eligible_attempts > 0 then round((1 - t.capacity_failures::numeric / t.eligible_attempts) * 100, 2) end as capacity_pct,
    case when t.eligible_attempts > 0 then round((1 - t.call_error_failures::numeric / t.eligible_attempts) * 100, 2) end as call_error_pct,
    case when t.eligible_attempts > 0 then round(t.success_attempts::numeric / t.eligible_attempts * 100, 2) end as uptime_pct,
    t.buckets,
    t.last_attempt_at
  from totals t
  left join public.v2_providers provider on provider.provider_slug = t.provider_id
  order by t.attempts desc, t.provider_id, t.service_tier;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) IS 'Per-attempt provider reachability, capacity and call-error rates for a public model, per provider and service tier with hourly buckets. Customer- and Phaseo-caused attempts are excluded from the rates and counted separately for internal use.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) FROM PUBLIC, "anon", "authenticated";
