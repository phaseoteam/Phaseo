CREATE OR REPLACE FUNCTION public.get_public_model_performance (
  p_hours        integer DEFAULT 24,
  p_min_requests integer DEFAULT 0
)
  RETURNS TABLE (
    model_id           text,
    provider           text,
    requests           bigint,
    cost_per_1m_tokens numeric,
    median_latency_ms  numeric,
    p95_latency_ms     numeric,
    median_throughput  numeric,
    success_rate       numeric
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_since date := ((now() at time zone 'utc')::date - greatest(ceil(greatest(p_hours, 1)::numeric / 24.0)::int, 1));
begin
  return query
  with grouped as (
    select
      d.model_id,
      d.provider_id as provider,
      sum(d.requests)::bigint as req_count,
      sum(d.total_tokens)::bigint as total_tok,
      sum(d.total_cost_nanos)::bigint as total_cost_nano,
      sum(d.success_requests)::bigint as success_req_count,
      sum(d.latency_sum_ms)::numeric as latency_sum,
      sum(d.latency_samples)::bigint as latency_samples,
      sum(d.throughput_sum)::numeric as throughput_sum,
      sum(d.throughput_samples)::bigint as throughput_samples
    from public.v2_rpc_gateway_model_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
      and d.provider_id is not null
      and d.provider_id <> ''
    group by d.model_id, d.provider_id
  )
  select
    g.model_id,
    g.provider,
    g.req_count as requests,
    case
      when g.total_tok > 0 then
        round((g.total_cost_nano::numeric / 1000000000.0) / (g.total_tok::numeric / 1000000.0), 2)
      else 0
    end as cost_per_1m_tokens,
    round(
      case when g.latency_samples > 0
        then g.latency_sum / g.latency_samples::numeric
        else null
      end,
      0
    ) as median_latency_ms,
    round(
      case when g.latency_samples > 0
        then g.latency_sum / g.latency_samples::numeric
        else null
      end,
      0
    ) as p95_latency_ms,
    round(
      case when g.throughput_samples > 0
        then g.throughput_sum / g.throughput_samples::numeric
        else null
      end,
      2
    ) as median_throughput,
    round(
      case when g.req_count > 0
        then g.success_req_count::numeric / g.req_count::numeric
        else null
      end,
      4
    ) as success_rate
  from grouped g
  where g.req_count >= p_min_requests
  order by g.req_count desc;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_model_performance"(integer, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_model_performance"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_model_performance"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_model_performance"(integer, integer) TO "postgres";
