CREATE OR REPLACE FUNCTION public.get_usage_daily_app (
  p_since timestamp with time zone DEFAULT (now() - '30 days'::interval)
)
  RETURNS TABLE (
    day_bucket     timestamp with time zone,
    app_id         uuid,
    requests       bigint,
    total_tokens   bigint,
    total_cost_usd numeric,
    unique_models  integer,
    success_rate   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    d.day_bucket,
    d.app_id,
    d.requests::bigint as requests,
    d.total_tokens::bigint as total_tokens,
    round(d.total_cost_nanos / 1000000000.0, 4) as total_cost_usd,
    d.unique_models::integer as unique_models,
    round(
      case when d.requests > 0
        then (d.success_requests::numeric / d.requests::numeric)
        else null
      end,
      4
    ) as success_rate
  from public.v2_rpc_gateway_usage_rollup_daily_app d
  where d.day_bucket >= (date_trunc('day', p_since at time zone 'utc') at time zone 'utc')
  order by d.day_bucket desc, d.requests desc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_usage_daily_app"(timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_usage_daily_app"(timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_usage_daily_app"(timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_usage_daily_app"(timestamp WITH time zone) TO "postgres";
