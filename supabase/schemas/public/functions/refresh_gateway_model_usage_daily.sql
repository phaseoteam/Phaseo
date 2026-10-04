CREATE OR REPLACE FUNCTION public.refresh_gateway_model_usage_daily (
  p_since timestamp with time zone DEFAULT (now() - '90 days'::interval),
  p_until timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.refresh_v2_analytics_range(p_since, p_until, null);
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_model_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."refresh_gateway_model_usage_daily"(timestamp with time zone, timestamp with time zone) IS 'Refreshes daily model/provider/endpoint usage rollups from gateway_requests for the supplied UTC window.';

REVOKE ALL ON FUNCTION "public"."refresh_gateway_model_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_model_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_gateway_model_usage_daily"(timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
