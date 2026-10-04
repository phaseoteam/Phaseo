CREATE OR REPLACE FUNCTION public.get_v2_model_performance_colos_unfiltered (
  p_model_slug text
)
  RETURNS TABLE (
    cloudflare_colo text,
    request_count   bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    upper(trim(usage.cloudflare_colo)) as cloudflare_colo,
    sum(usage.requests)::bigint as request_count
  from public.v2_public_usage_hourly usage
  where usage.model_slug = lower(trim(p_model_slug))
    and usage.cloudflare_colo is not null
    and usage.bucket_start >= now() - interval '30 days'
  group by upper(trim(usage.cloudflare_colo))
  order by request_count desc, cloudflare_colo asc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_colos_unfiltered"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_colos_unfiltered"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_colos_unfiltered"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_colos_unfiltered"(text) FROM PUBLIC, "anon", "authenticated";
