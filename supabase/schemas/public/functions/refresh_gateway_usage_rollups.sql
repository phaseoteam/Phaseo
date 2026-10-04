CREATE OR REPLACE FUNCTION public.refresh_gateway_usage_rollups (
  p_since timestamp with time zone DEFAULT (now() - '03:00:00'::interval)
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.refresh_v2_analytics_range(p_since, now(), null);
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_usage_rollups"(timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_gateway_usage_rollups"(timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_usage_rollups"(timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_gateway_usage_rollups"(timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
