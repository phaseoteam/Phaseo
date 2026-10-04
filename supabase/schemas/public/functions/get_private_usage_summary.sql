CREATE OR REPLACE FUNCTION public.get_private_usage_summary (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with scoped as materialized (
  select coalesce(nullif(usage.model_slug, ''), 'unknown') as model,
    coalesce(nullif(route.provider_slug, ''), 'unknown') as provider,
    usage.requests, usage.cost_nanos, usage.latency_sum_ms, usage.latency_count
  from public.v2_private_usage_daily usage
  left join public.v2_model_provider_routes route using (provider_model_id)
  where usage.workspace_id = p_workspace_id
    -- Native date predicates use the existing workspace/date index. Retain
    -- timestamp comparisons to preserve partial-day and session-timezone behavior.
    and usage.usage_date >= p_from::date and usage.usage_date <= p_to::date
    and usage.usage_date::timestamptz >= p_from
    and usage.usage_date::timestamptz <= p_to
), models as (
  select model, sum(requests) as requests, sum(cost_nanos) / 1e9 as cost,
    (sum(latency_sum_ms) filter (where latency_count > 0 and latency_sum_ms > 0))::numeric
      / nullif(sum(latency_count) filter (where latency_count > 0 and latency_sum_ms > 0), 0) as speed_ms
  from scoped group by model
), providers as (
  select provider, sum(requests) as requests from scoped group by provider
)
select jsonb_build_object(
  'topModel', (select jsonb_build_object('name', model, 'requests', requests) from models order by requests desc, model limit 1),
  'topProvider', (select jsonb_build_object('name', provider, 'requests', requests) from providers order by requests desc, provider limit 1),
  'mostExpensive', (select jsonb_build_object('name', model, 'cost', cost) from models order by cost desc, model limit 1),
  'fastestModel', (select jsonb_build_object('name', model, 'speedMs', round(speed_ms)) from models where speed_ms > 0 order by speed_ms, model limit 1)
);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_summary"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_summary"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_summary"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_summary"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_summary"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon";
