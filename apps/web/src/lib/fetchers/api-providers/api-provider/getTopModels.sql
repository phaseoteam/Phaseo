CREATE OR REPLACE FUNCTION get_top_models_stats_tokens(
    p_provider text,
    p_since timestamp with time zone,
    p_limit int
)
RETURNS TABLE(
    model_id text,
    model_name text,
    provider_model_slug text,
    request_count bigint,
    median_latency_ms numeric,
    median_throughput numeric,
    total_tokens bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      coalesce(
        nullif(gr.canonical_model_id, ''),
        public.resolve_public_model_id(gr.model_id, gr.provider),
        nullif(gr.model_id, ''),
        'unknown'
      ) AS model_id,
      gr.success,
      gr.usage,
      gr.latency_ms::numeric AS latency_ms,
      gr.throughput::numeric AS throughput
    FROM public.gateway_requests gr
    WHERE gr.provider = p_provider
      AND gr.created_at >= p_since
  ),
  grouped AS (
    SELECT
      b.model_id,
      count(*)::bigint AS request_count,
      coalesce(sum(public.gateway_usage_total_tokens(b.usage)), 0)::bigint AS total_tokens,
      coalesce(sum(coalesce(b.latency_ms, 0)), 0)::numeric AS latency_sum_ms,
      count(b.latency_ms)::bigint AS latency_samples,
      coalesce(sum(coalesce(b.throughput, 0)), 0)::numeric AS throughput_sum,
      count(b.throughput)::bigint AS throughput_samples
    FROM base b
    GROUP BY b.model_id
  )
  SELECT
    g.model_id,
    COALESCE(dm.name, g.model_id) AS model_name,
    MAX(dapm.provider_model_slug) AS provider_model_slug,
    g.request_count,
    CASE
      WHEN g.latency_samples > 0 THEN g.latency_sum_ms / g.latency_samples
      ELSE NULL
    END AS median_latency_ms,
    CASE
      WHEN g.throughput_samples > 0 THEN g.throughput_sum / g.throughput_samples
      ELSE NULL
    END AS median_throughput,
    g.total_tokens
  FROM grouped g
  LEFT JOIN public.data_models dm ON dm.model_id = g.model_id
  LEFT JOIN public.data_api_provider_models dapm
    ON dapm.provider_id = p_provider
   AND (dapm.model_id = g.model_id OR dapm.api_model_id = g.model_id)
  GROUP BY
    g.model_id,
    COALESCE(dm.name, g.model_id),
    g.request_count,
    g.total_tokens,
    g.latency_sum_ms,
    g.latency_samples,
    g.throughput_sum,
    g.throughput_samples
  ORDER BY g.request_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
