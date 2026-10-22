SET local check_function_bodies = off;

-- Per-policy throttle totals for Settings → Rate limits, read from the per-minute rollup.

CREATE OR REPLACE FUNCTION public.workspace_rate_limit_throttle_summary (
  p_workspace_id uuid,
  p_since        timestamp with time zone DEFAULT (now() - '24:00:00'::interval)
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Requests each rate limit policy rejected in the workspace since p_since, for Settings → Rate
-- limits: a JSON array of {policy_id, throttled_requests, last_throttled_at}, most throttled
-- first. It reads the per-minute rollup through its (workspace_id, bucket_start, ...) unique
-- index, so a day is at most 1,440 buckets per policy, scope and key.
  select coalesce(jsonb_agg(jsonb_build_object(
      'policy_id', summary.policy_id,
      'throttled_requests', summary.throttled_requests,
      'last_throttled_at', summary.last_throttled_at
    ) order by summary.throttled_requests desc, summary.policy_id), '[]'::jsonb)
  from (
    select throttles.policy_id,
           sum(throttles.throttled_requests)::bigint as throttled_requests,
           max(throttles.bucket_start) as last_throttled_at
    from public.workspace_rate_limit_throttles_minute throttles
    where throttles.workspace_id = p_workspace_id
      and throttles.bucket_start >= p_since
    group by throttles.policy_id
  ) summary;
$function$;

GRANT EXECUTE ON FUNCTION "public"."workspace_rate_limit_throttle_summary"(uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_rate_limit_throttle_summary"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_rate_limit_throttle_summary"(uuid, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_rate_limit_throttle_summary"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
