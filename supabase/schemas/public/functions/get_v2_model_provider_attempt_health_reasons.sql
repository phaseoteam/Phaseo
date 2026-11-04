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
