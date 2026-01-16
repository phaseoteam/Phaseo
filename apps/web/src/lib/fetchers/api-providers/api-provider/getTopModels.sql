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
  WITH resolved AS (
    SELECT
      gr.*,
      dapm.internal_model_id,
      dapm.provider_model_slug,
      dapm.api_model_id
    FROM public.gateway_requests gr
    LEFT JOIN public.data_api_provider_models dapm
      ON dapm.provider_id = p_provider

      -- If your endpoint values align, keep this; otherwise remove it.
      -- AND dapm.endpoint = gr.endpoint

      -- Match whichever identifier you actually store in gateway_requests.model_id
      AND (
            gr.model_id = dapm.internal_model_id
         OR gr.model_id = dapm.api_model_id
         OR gr.model_id = dapm.provider_api_model_id
         OR gr.model_id = dapm.provider_model_slug
      )

      -- Historical mapping (recommended if you version provider model mappings)
      AND gr.created_at >= dapm.effective_from
      AND (dapm.effective_to IS NULL OR gr.created_at < dapm.effective_to)

    WHERE gr.provider = p_provider
      AND gr.created_at >= p_since
      AND gr.model_id IS NOT NULL
  )
  SELECT
    COALESCE(r.internal_model_id, r.model_id)                                    AS model_id,
    COALESCE(dm.name, COALESCE(r.internal_model_id, r.model_id))                AS model_name,

    -- Optional: keep this if you want to show the provider’s slug alongside the internal id
    MAX(r.provider_model_slug)                                                  AS provider_model_slug,

    COUNT(*)::bigint                                                            AS request_count,

    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms) FILTER (
      WHERE r.latency_ms IS NOT NULL AND r.latency_ms > 0
    )                                                                           AS median_latency_ms,

    percentile_cont(0.5) WITHIN GROUP (ORDER BY r.throughput) FILTER (
      WHERE r.throughput IS NOT NULL AND r.throughput > 0
    )                                                                           AS median_throughput,

    SUM(
      COALESCE(
        CASE WHEN (r.usage->>'total_tokens')  ~ '^\d+$' THEN (r.usage->>'total_tokens')::bigint END,
        (
          COALESCE(CASE WHEN (r.usage->>'input_tokens')  ~ '^\d+$' THEN (r.usage->>'input_tokens')::bigint END, 0) +
          COALESCE(CASE WHEN (r.usage->>'output_tokens') ~ '^\d+$' THEN (r.usage->>'output_tokens')::bigint END, 0)
        ),
        0
      )
    )::bigint                                                                    AS total_tokens

  FROM resolved r
  LEFT JOIN public.data_models dm
    ON dm.model_id = COALESCE(r.internal_model_id, r.model_id)

  GROUP BY
    COALESCE(r.internal_model_id, r.model_id),
    COALESCE(dm.name, COALESCE(r.internal_model_id, r.model_id))

  ORDER BY request_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;