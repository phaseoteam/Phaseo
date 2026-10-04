CREATE OR REPLACE FUNCTION public.get_usage_tokens_weekly_model_provider (
  p_since timestamp with time zone DEFAULT (now() - '56 days'::interval)
)
  RETURNS TABLE (
    week_bucket    timestamp with time zone,
    model_id       text,
    provider       text,
    requests       bigint,
    total_tokens   bigint,
    total_cost_usd numeric,
    success_rate   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with normalized_requests as (
    select
      date_trunc('week', gr.created_at) as week_bucket,
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, '')
      ) as canonical_model_id,
      coalesce(nullif(gr.provider, ''), 'unknown') as provider_id,
      gr.success,
      public.gateway_usage_total_tokens(gr.usage)::bigint as total_tokens,
      coalesce(gr.cost_nanos, 0)::bigint as total_cost_nanos
    from private.v2_rpc_gateway_requests_compat gr
    where gr.created_at >= p_since
  ),
  grouped as (
    select
      nr.week_bucket,
      nr.canonical_model_id as model_id,
      nr.provider_id as provider,
      count(*)::bigint as requests,
      sum(nr.total_tokens)::bigint as total_tokens,
      sum(nr.total_cost_nanos)::bigint as total_cost_nanos,
      count(*) filter (where nr.success is true)::bigint as success_requests
    from normalized_requests nr
    where nr.canonical_model_id is not null
      and nr.provider_id <> 'unknown'
    group by nr.week_bucket, nr.canonical_model_id, nr.provider_id
  )
  select
    g.week_bucket,
    g.model_id,
    g.provider,
    g.requests,
    g.total_tokens,
    round(g.total_cost_nanos / 1000000000.0, 4) as total_cost_usd,
    round(
      case
        when g.requests > 0 then g.success_requests::numeric / g.requests::numeric
        else null
      end,
      4
    ) as success_rate
  from grouped g
  order by g.week_bucket desc, g.total_tokens desc;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_usage_tokens_weekly_model_provider"(timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_usage_tokens_weekly_model_provider"(timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."get_usage_tokens_weekly_model_provider"(timestamp with time zone) IS 'Aggregates weekly model/provider usage directly from gateway_requests without relying on removed rollup tables.';

REVOKE ALL ON FUNCTION "public"."get_usage_tokens_weekly_model_provider"(timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_usage_tokens_weekly_model_provider"(timestamp WITH time zone) TO "postgres";
