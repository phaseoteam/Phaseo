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
