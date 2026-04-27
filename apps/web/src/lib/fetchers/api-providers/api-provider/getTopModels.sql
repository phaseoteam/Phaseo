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
  WITH grouped AS (
    SELECT
      r.canonical_model_id AS model_id,
      SUM(r.requests)::bigint AS request_count,
      SUM(r.total_tokens)::bigint AS total_tokens,
      SUM(r.latency_sum_ms) AS latency_sum_ms,
      SUM(r.latency_samples)::bigint AS latency_samples,
      SUM(r.throughput_sum) AS throughput_sum,
      SUM(r.throughput_samples)::bigint AS throughput_samples
    FROM public.gateway_usage_rollup_15m_model_provider r
    WHERE r.provider = p_provider
      AND r.bucket_15m >= p_since
      AND r.canonical_model_id IS NOT NULL
    GROUP BY r.canonical_model_id
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
