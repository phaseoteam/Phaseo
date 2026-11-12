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
