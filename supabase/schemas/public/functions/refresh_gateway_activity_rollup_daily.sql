CREATE OR REPLACE FUNCTION public.refresh_gateway_activity_rollup_daily (
  p_workspace_id uuid,
  p_start        timestamp with time zone,
  p_end          timestamp with time zone
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.refresh_v2_analytics_range(p_start, p_end, p_workspace_id);
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_activity_rollup_daily"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_gateway_activity_rollup_daily"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_gateway_activity_rollup_daily"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_gateway_activity_rollup_daily"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
