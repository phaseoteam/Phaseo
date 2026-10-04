CREATE OR REPLACE FUNCTION public.get_v2_model_provider_health (
  p_model_slug  text,
  p_window_days integer DEFAULT 3
)
  RETURNS TABLE (
    provider_id             text,
    provider_name           text,
    requests                bigint,
    success_requests        bigint,
    failed_requests         bigint,
    health_requests         bigint,
    health_success_requests bigint,
    failed_attempts         bigint,
    fallback_attempts       bigint,
    uptime_pct              numeric,
    request_success_pct     numeric,
    failure_pct             numeric,
    avg_latency_ms          numeric,
    buckets                 jsonb,
    last_request_at         date
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select health.provider_slug, max(provider.name), sum(health.request_count)::bigint,
    sum(health.successful_request_count)::bigint, sum(health.request_count - health.successful_request_count)::bigint,
    sum(health.attempt_count)::bigint, sum(health.successful_attempts)::bigint, sum(health.failed_attempts)::bigint,
    sum(health.fallback_attempts)::bigint,
    case when sum(health.attempt_count) > 0 then sum(health.successful_attempts) * 100.0 / sum(health.attempt_count) else null end,
    case when sum(health.request_count) > 0 then sum(health.successful_request_count) * 100.0 / sum(health.request_count) else null end,
    case when sum(health.attempt_count) > 0 then sum(health.failed_attempts) * 100.0 / sum(health.attempt_count) else null end,
    case when sum(health.latency_count) > 0 then sum(health.latency_sum_ms)::numeric / sum(health.latency_count) else null end,
    jsonb_agg(jsonb_build_object('day', health.usage_date, 'requests', health.request_count, 'attempts', health.attempt_count,
      'successful_attempts', health.successful_attempts, 'failed_attempts', health.failed_attempts,
      'fallback_attempts', health.fallback_attempts) order by health.usage_date), max(health.usage_date)
  from public.v2_public_provider_health_daily health
  left join public.v2_providers provider on provider.provider_slug = health.provider_slug
  where health.model_slug = lower(trim(p_model_slug))
    and health.usage_date >= current_date - greatest(1, least(coalesce(p_window_days, 3), 90))
  group by health.provider_slug
  order by sum(health.failed_attempts) desc, health.provider_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health"(text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_health"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health"(text, integer) TO "postgres";
