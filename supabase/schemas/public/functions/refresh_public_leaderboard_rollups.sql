CREATE OR REPLACE FUNCTION public.refresh_public_leaderboard_rollups (
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

GRANT EXECUTE ON FUNCTION "public"."refresh_public_leaderboard_rollups"(timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."refresh_public_leaderboard_rollups"(timestamp with time zone, timestamp with time zone) IS 'Refreshes public leaderboard rollups from gateway_requests, then serves rankings from rollup tables.';

REVOKE ALL ON FUNCTION "public"."refresh_public_leaderboard_rollups"(timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_public_leaderboard_rollups"(timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_public_leaderboard_rollups"(timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
