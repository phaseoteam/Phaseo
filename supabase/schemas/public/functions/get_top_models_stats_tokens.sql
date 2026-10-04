CREATE OR REPLACE FUNCTION public.get_top_models_stats_tokens (
  p_provider text,
  p_since    timestamp with time zone,
  p_limit    integer
)
  RETURNS TABLE (
    model_id            text,
    model_name          text,
    provider_model_slug text,
    request_count       bigint,
    median_latency_ms   numeric,
    median_throughput   numeric,
    total_tokens        bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  return query
  with grouped as (
    select
      r.canonical_model_id as model_id,
      sum(r.requests)::bigint as request_count,
      sum(r.total_tokens)::bigint as total_tokens,
      sum(r.latency_sum_ms) as latency_sum_ms,
      sum(r.latency_samples)::bigint as latency_samples,
      sum(r.throughput_sum) as throughput_sum,
      sum(r.throughput_samples)::bigint as throughput_samples
    from public.v2_web_public_usage_hourly r
    where r.provider = p_provider
      and r.bucket_15m >= p_since
      and r.canonical_model_id is not null
    group by r.canonical_model_id
  )
  select
    g.model_id,
    coalesce(dm.name, g.model_id) as model_name,
    max(dapm.provider_model_slug) as provider_model_slug,
    g.request_count,
    case
      when g.latency_samples > 0 then g.latency_sum_ms / g.latency_samples
      else null
    end as median_latency_ms,
    case
      when g.throughput_samples > 0 then g.throughput_sum / g.throughput_samples
      else null
    end as median_throughput,
    g.total_tokens
  from grouped g
  left join private.v2_rpc_models_compat dm on dm.model_id = g.model_id
  left join private.v2_rpc_routes_compat dapm
    on dapm.provider_id = p_provider
   and (dapm.model_id = g.model_id or dapm.api_model_id = g.model_id)
  group by
    g.model_id,
    coalesce(dm.name, g.model_id),
    g.request_count,
    g.total_tokens,
    g.latency_sum_ms,
    g.latency_samples,
    g.throughput_sum,
    g.throughput_samples
  order by g.request_count desc
  limit p_limit;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_top_models_stats_tokens"(text, timestamp WITH time zone, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_top_models_stats_tokens"(text, timestamp WITH time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_top_models_stats_tokens"(text, timestamp WITH time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_top_models_stats_tokens"(text, timestamp WITH time zone, integer) TO "postgres";
