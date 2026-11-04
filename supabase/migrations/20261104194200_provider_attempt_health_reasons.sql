-- Provider attempt health follow-ups for model pages.
--
-- 1. v2_request_attempts.health_reason: why each attempt got its health_class, for example
--    route_model_not_found (the provider does not know the model id on Phaseo's managed route),
--    provider_rejected_request_accepted_elsewhere (a 4xx that another route then accepted, so the
--    request was fine and the route or request mapping is Phaseo's problem), rate_limited or
--    client_cancelled. The gateway sets it (apps/api/src/pipeline/execute/attempt-health.ts).
--    Nullable: plain successes and rows recorded before this change have none.
-- 2. ingest_v2_gateway_request stores the attempt's health_reason next to its health_class. As in
--    20261104163425, the deployed definition is patched at the attempts insert only, so edits to
--    other sections of the function are preserved.
-- 3. get_v2_model_provider_attempt_health_rows: one classified row per attempt, shared by the
--    rates and the reasons. Older rows are classified the same way where the stored fields allow:
--    a 4xx followed by a success on another route is Phaseo's, and so is a 404 on the managed key.
-- 4. get_v2_model_provider_attempt_health: the rates are now a funnel (reachable of eligible,
--    accepted of those that reached the provider, completed of those accepted). Same columns.
-- 5. get_v2_model_provider_attempt_health_reasons: counts by class and reason, internal only.
-- The table is small; a nullable column with a CHECK takes a short lock.

SET local check_function_bodies = off;

ALTER TABLE "public"."v2_request_attempts"
  ADD COLUMN "health_reason" text;

ALTER TABLE "public"."v2_request_attempts"
  ADD CONSTRAINT "v2_request_attempts_health_reason_check" CHECK (((health_reason IS NULL) OR (health_reason ~ '^[a-z][a-z0-9_]{0,63}$'::text)));

COMMENT ON COLUMN "public"."v2_request_attempts"."health_reason" IS 'Why the attempt got its health_class, for example route_model_not_found, provider_rejected_request_accepted_elsewhere, rate_limited or client_cancelled (apps/api/src/pipeline/execute/attempt-health.ts). Null for a plain success and on rows recorded before the gateway sent reasons.';

do $migration$
declare
  definition text := pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure);
  column_anchor text := $anchor$    error_code, failure_class, upstream_response_id, latency_ms, cloudflare_colo, safe_metadata,
    health_class
  )$anchor$;
  column_replacement text := $replacement$    error_code, failure_class, upstream_response_id, latency_ms, cloudflare_colo, safe_metadata,
    health_class, health_reason
  )$replacement$;
  value_anchor text := $anchor$    case
      when item.value->>'health_class' in ('success', 'reachability', 'capacity', 'call_error', 'customer', 'phaseo')
      then item.value->>'health_class'
    end
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$anchor$;
  value_replacement text := $replacement$    case
      when item.value->>'health_class' in ('success', 'reachability', 'capacity', 'call_error', 'customer', 'phaseo')
      then item.value->>'health_class'
    end,
    case
      when item.value->>'health_class' in ('success', 'reachability', 'capacity', 'call_error', 'customer', 'phaseo')
        and item.value->>'health_reason' ~ '^[a-z][a-z0-9_]{0,63}$'
      then item.value->>'health_reason'
    end
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)$replacement$;
begin
  -- The anchors are LF-only, whatever line endings this file was checked out with.
  column_anchor := replace(column_anchor, chr(13), '');
  column_replacement := replace(column_replacement, chr(13), '');
  value_anchor := replace(value_anchor, chr(13), '');
  value_replacement := replace(value_replacement, chr(13), '');
  if strpos(definition, 'health_reason') > 0 then
    raise exception 'Attempt health_reason ingestion is already installed';
  end if;
  if (length(definition) - length(replace(definition, column_anchor, ''))) / length(column_anchor) <> 1 then
    raise exception 'Expected exactly one attempts insert column list with health_class';
  end if;
  if (length(definition) - length(replace(definition, value_anchor, ''))) / length(value_anchor) <> 1 then
    raise exception 'Expected exactly one attempts health_class value';
  end if;
  execute replace(replace(definition, column_anchor, column_replacement), value_anchor, value_replacement);
end;
$migration$;

CREATE OR REPLACE FUNCTION public.get_v2_model_provider_attempt_health_rows (
  p_model_slug  text,
  p_window_days integer DEFAULT 3
)
  RETURNS TABLE (
    provider_id   text,
    service_tier  text,
    occurred_at   timestamp with time zone,
    health_class  text,
    health_reason text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- One row per provider ATTEMPT for a public model, with the class and reason
  -- the model-page health functions aggregate. Attributed to the provider each
  -- attempt went to. Gateway-recorded classes and reasons are used as they are;
  -- older rows are classified here from what was persisted.
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
      attempt.attempt_number,
      attempt.provider_model_id,
      attempt.health_class as recorded_class,
      attempt.health_reason as recorded_reason,
      attempt.success,
      attempt.status_code,
      attempt.failure_class,
      lower(coalesce(attempt.safe_metadata->>'key_source', 'gateway')) as key_source,
      -- The served attempt is the request's last successful one.
      max(attempt.attempt_number) filter (where attempt.success)
        over (partition by attempt.request_event_id) as served_attempt_number,
      first_value(attempt.provider_model_id) over (
        partition by attempt.request_event_id
        order by attempt.success desc, attempt.attempt_number desc
        rows between unbounded preceding and unbounded following
      ) as served_route
    from facts fact
    join public.v2_request_attempts attempt on attempt.request_event_id = fact.request_event_id
  ),
  attempt_rows as (
    select
      route.provider_slug as provider_id,
      r.*,
      r.success and r.attempt_number = r.served_attempt_number as is_served,
      -- A provider rejected the request (4xx, not a key, limit or timeout
      -- status) and a later attempt on another route accepted it.
      not r.success
        and r.status_code between 400 and 499
        and r.status_code not in (401, 402, 403, 408, 429)
        and r.served_attempt_number > r.attempt_number
        and r.served_route is distinct from r.provider_model_id as accepted_elsewhere
    from request_attempts r
    join visible_routes route on route.provider_model_id = r.provider_model_id
  ),
  derived as (
    select
      r.*,
      -- Best-effort reason for rows the gateway did not classify, from what was
      -- persisted (no provider error body was stored). Approximations:
      --   * a 503 is always upstream_unavailable (never overloaded) and a 403
      --     on the managed key is always phaseo_key_auth;
      --   * a 404 on the managed key is route_model_not_found (in practice
      --     almost all of them were); a 400 naming an unknown model is not seen;
      --   * thrown errors had no transport flag: retryable ones count as
      --     transport, others as gateway_fault;
      --   * a served stream that broke is stream_break, including client
      --     cancellations recorded as upstream_stream_failure before the
      --     gateway told the two apart.
      case
        when r.failure_class = 'blocked' then 'breaker_blocked'
        when r.failure_class in ('no_pricing', 'unsupported_executor') then 'gateway_fault'
        when r.success then case
          when r.is_served and r.fact_error_code like 'client:%' then 'client_cancelled'
          when r.is_served and r.fact_error_code = 'upstream:upstream_stream_failure' then 'stream_break'
          when r.is_served and r.fact_error_code = 'gateway:google_empty_response' then 'empty_output'
          when r.is_served and r.fact_error_code = 'gateway:normalization_failed' then 'invalid_output'
          when r.is_served and r.fact_stop_reason = 'error' then 'error_finish'
        end
        when r.key_source = 'byok' and r.status_code = 429 then 'customer_key_limit'
        when r.key_source = 'byok' and r.status_code in (401, 402, 403) then 'byok_error'
        when r.status_code = 429 then 'rate_limited'
        when r.status_code = 529 then 'overloaded'
        when r.status_code = 408 then 'headers_timeout'
        when r.status_code in (401, 402, 403) then 'phaseo_key_auth'
        when r.status_code = 404 and r.key_source <> 'byok' then 'route_model_not_found'
        when r.status_code between 400 and 499 then 'invalid_request'
        when r.status_code in (502, 503, 504) or r.status_code between 520 and 527 then 'upstream_unavailable'
        when r.status_code between 500 and 599 then 'server_error'
        when r.status_code between 200 and 299 then null
        when r.failure_class = 'retryable_error' then 'transport'
        else 'gateway_fault'
      end as derived_reason
    from attempt_rows r
  ),
  derived_classes as (
    select
      d.*,
      case
        when d.derived_reason is null then 'success'
        when d.derived_reason in ('transport', 'headers_timeout', 'upstream_unavailable') then 'reachability'
        when d.derived_reason in ('rate_limited', 'overloaded') then 'capacity'
        when d.derived_reason in ('server_error', 'stream_break', 'empty_output', 'invalid_output', 'error_finish') then 'call_error'
        when d.derived_reason in ('client_cancelled', 'byok_error', 'customer_key_limit', 'invalid_request', 'content_policy', 'region_unavailable') then 'customer'
        else 'phaseo'
      end as derived_class
    from derived d
  )
  select
    c.provider_id,
    c.service_tier,
    c.occurred_at,
    case
      -- The gateway recorded a reason: it already applied every rule.
      when c.recorded_reason is not null then c.recorded_class
      -- A request rejection another route accepted is Phaseo's routing problem.
      when c.accepted_elsewhere and coalesce(c.recorded_class, c.derived_class) = 'customer' then 'phaseo'
      else coalesce(c.recorded_class, c.derived_class)
    end as health_class,
    case
      when c.recorded_reason is not null then c.recorded_reason
      when c.accepted_elsewhere and coalesce(c.recorded_class, c.derived_class) = 'customer'
        then 'provider_rejected_request_accepted_elsewhere'
      -- A class recorded without a reason keeps the derived reason only when they agree.
      when c.recorded_class is null or c.recorded_class = c.derived_class then c.derived_reason
    end as health_reason
  from derived_classes c;
$function$;

COMMENT ON FUNCTION "public"."get_v2_model_provider_attempt_health_rows"(text, integer) IS 'Internal: one row per provider attempt for a public model in the window, with its health class and reason (gateway-recorded, or derived for older rows). Aggregated by get_v2_model_provider_attempt_health and get_v2_model_provider_attempt_health_reasons.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health_rows"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health_rows"(text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health_rows"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health_rows"(text, integer) FROM PUBLIC, "anon", "authenticated";

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
  -- later succeeded elsewhere. Eligible attempts exclude customer- and
  -- Phaseo-caused failures. The three rates are a funnel:
  --   reachable = 1 - reachability failures / eligible attempts
  --   accepted  = 1 - capacity failures / attempts that reached the provider
  --   completed = 1 - call errors / attempts the provider accepted
  -- customer_excluded / phaseo_excluded are for internal use only.
  with classified as (
    select attempt.provider_id, attempt.service_tier, attempt.occurred_at, attempt.health_class
    from public.get_v2_model_provider_attempt_health_rows(p_model_slug, p_window_days) attempt
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
        'reachability_pct', case when h.eligible_attempts > 0
          then round((1 - h.reachability_failures::numeric / h.eligible_attempts) * 100, 2) end,
        'capacity_pct', case when h.eligible_attempts - h.reachability_failures > 0
          then round((1 - h.capacity_failures::numeric / (h.eligible_attempts - h.reachability_failures)) * 100, 2) end,
        'call_error_pct', case when h.success_attempts + h.call_error_failures > 0
          then round((1 - h.call_error_failures::numeric / (h.success_attempts + h.call_error_failures)) * 100, 2) end,
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
    case when t.eligible_attempts > 0
      then round((1 - t.reachability_failures::numeric / t.eligible_attempts) * 100, 2) end as reachability_pct,
    case when t.eligible_attempts - t.reachability_failures > 0
      then round((1 - t.capacity_failures::numeric / (t.eligible_attempts - t.reachability_failures)) * 100, 2) end as capacity_pct,
    case when t.success_attempts + t.call_error_failures > 0
      then round((1 - t.call_error_failures::numeric / (t.success_attempts + t.call_error_failures)) * 100, 2) end as call_error_pct,
    case when t.eligible_attempts > 0 then round(t.success_attempts::numeric / t.eligible_attempts * 100, 2) end as uptime_pct,
    t.buckets,
    t.last_attempt_at
  from totals t
  left join public.v2_providers provider on provider.provider_slug = t.provider_id
  order by t.attempts desc, t.provider_id, t.service_tier;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) IS 'Per-attempt provider health for a public model, per provider and service tier with hourly buckets: reachable, accepted (not turned away for capacity, of those that reached the provider) and completed (no call error, of those accepted). Customer- and Phaseo-caused attempts are excluded from the rates and counted separately for internal use.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health"(text, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_v2_model_provider_attempt_health_reasons (
  p_model_slug  text,
  p_window_days integer DEFAULT 3
)
  RETURNS TABLE (
    provider_id     text,
    service_tier    text,
    health_class    text,
    health_reason   text,
    attempts        bigint,
    last_attempt_at timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Internal only (never published by web-api): what went wrong, per provider,
  -- service tier, class and reason, for the attempts the model-page rates count
  -- against providers or exclude. Successes are left out.
  select
    attempt.provider_id,
    attempt.service_tier,
    attempt.health_class,
    coalesce(attempt.health_reason, 'unclassified') as health_reason,
    count(*)::bigint as attempts,
    max(attempt.occurred_at) as last_attempt_at
  from public.get_v2_model_provider_attempt_health_rows(p_model_slug, p_window_days) attempt
  where attempt.health_class <> 'success'
  group by attempt.provider_id, attempt.service_tier, attempt.health_class, coalesce(attempt.health_reason, 'unclassified')
  order by attempt.provider_id, attempt.service_tier, count(*) desc, coalesce(attempt.health_reason, 'unclassified');
$function$;

COMMENT ON FUNCTION "public"."get_v2_model_provider_attempt_health_reasons"(text, integer) IS 'Internal only: provider-attempt failure and exclusion counts for a public model by provider, service tier, health class and reason (for example route_model_not_found or provider_rejected_request_accepted_elsewhere). Not published on model pages.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health_reasons"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health_reasons"(text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_attempt_health_reasons"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_attempt_health_reasons"(text, integer) FROM PUBLIC, "anon", "authenticated";
