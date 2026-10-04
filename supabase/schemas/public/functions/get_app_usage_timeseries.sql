CREATE OR REPLACE FUNCTION public.get_app_usage_timeseries (
  p_app_id uuid,
  p_days   integer DEFAULT 28
)
  RETURNS TABLE (
    bucket   date,
    model_id text,
    tokens   bigint,
    requests bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    date_trunc('day', gr.created_at)::date as bucket,
    coalesce(gr.model_id, 'Unknown model') as model_id,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    count(*)::bigint as requests
  from private.v2_rpc_gateway_requests_compat gr
  where gr.app_id = p_app_id
    and gr.success = true
    and gr.created_at >= now() - (p_days::text || ' days')::interval
  group by 1, 2
  order by 1, 2;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_app_usage_timeseries"(uuid, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_app_usage_timeseries"(uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_app_usage_timeseries"(uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_app_usage_timeseries"(uuid, integer) TO "postgres";
