-- Add previous-period token totals to public rankings for % change display

DROP FUNCTION IF EXISTS public.get_public_model_rankings(text, text, integer);
CREATE OR REPLACE FUNCTION public.get_public_model_rankings(
  p_time_range text DEFAULT 'week',
  p_metric text DEFAULT 'tokens',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  model_id text,
  provider text,
  requests bigint,
  total_tokens bigint,
  prev_total_tokens bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_cost_usd numeric,
  median_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric,
  rank integer,
  prev_rank integer,
  trend text
) AS $$
DECLARE
  v_since timestamptz;
  v_prev_since timestamptz;
  v_prev_until timestamptz;
  v_now timestamptz := now();
  v_start timestamptz;
BEGIN
  CASE p_time_range
    WHEN 'today' THEN
      v_since := date_trunc('day', v_now);
      v_prev_since := v_since - interval '1 day';
      v_prev_until := v_since;
    WHEN 'week' THEN
      v_since := v_now - interval '7 days';
      v_prev_since := v_now - interval '14 days';
      v_prev_until := v_now - interval '7 days';
    WHEN 'month' THEN
      v_since := date_trunc('month', v_now);
      v_prev_since := v_since - interval '1 month';
      v_prev_until := v_since;
    ELSE
      v_since := '2020-01-01'::timestamptz;
      v_prev_since := v_since;
      v_prev_until := v_since;
  END CASE;

  v_start := LEAST(v_since, v_prev_since);

  RETURN QUERY
  WITH resolved AS (
    SELECT
      gr.created_at,
      gr.provider,
      gr.usage,
      gr.cost_nanos,
      gr.latency_ms,
      gr.throughput,
      gr.success,
      COALESCE(dm_direct.model_id, apm.internal_model_id) as internal_model_id
    FROM public.gateway_requests gr
    LEFT JOIN public.data_models dm_direct on dm_direct.model_id = gr.model_id
    LEFT JOIN LATERAL (
      SELECT apm.internal_model_id
      FROM public.data_api_provider_models apm
      WHERE apm.api_model_id = gr.model_id
        AND apm.provider_id = gr.provider
      ORDER BY apm.is_active_gateway desc, apm.updated_at desc nulls last
      LIMIT 1
    ) apm ON TRUE
    WHERE gr.created_at >= v_start
  ),
  current_period AS (
    SELECT
      r.internal_model_id as model_id,
      r.provider,
      COUNT(*) as req_count,
      SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0)) as total_tok,
      SUM(COALESCE((r.usage->>'input_tokens')::bigint, 0)) as input_tok,
      SUM(COALESCE((r.usage->>'output_tokens')::bigint, 0)) as output_tok,
      SUM(COALESCE(r.cost_nanos, 0)) as total_cost_nano,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms) as p50_latency,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.throughput) as p50_throughput,
      AVG(CASE WHEN r.success THEN 1.0 ELSE 0.0 END) as succ_rate
    FROM resolved r
    WHERE r.created_at >= v_since
      AND r.internal_model_id IS NOT NULL
      AND r.provider IS NOT NULL
      AND r.provider <> ''
    GROUP BY r.internal_model_id, r.provider
  ),
  previous_period AS (
    SELECT
      r.internal_model_id as model_id,
      r.provider,
      COUNT(*) as req_count,
      SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0)) as total_tok
    FROM resolved r
    WHERE r.created_at >= v_prev_since
      AND r.created_at < v_prev_until
      AND r.internal_model_id IS NOT NULL
      AND r.provider IS NOT NULL
      AND r.provider <> ''
    GROUP BY r.internal_model_id, r.provider
  ),
  ranked_current AS (
    SELECT
      cp.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE p_metric
            WHEN 'tokens' THEN cp.total_tok
            WHEN 'requests' THEN cp.req_count
            WHEN 'cost' THEN cp.total_cost_nano
            ELSE cp.total_tok
          END DESC
      ) as rk
    FROM current_period cp
  ),
  ranked_previous AS (
    SELECT
      pp.model_id,
      pp.provider,
      ROW_NUMBER() OVER (
        ORDER BY pp.req_count DESC
      ) as rk
    FROM previous_period pp
  )
  SELECT
    rc.model_id,
    rc.provider,
    rc.req_count::bigint,
    rc.total_tok::bigint,
    COALESCE(pp.total_tok, 0)::bigint as prev_total_tokens,
    rc.input_tok::bigint,
    rc.output_tok::bigint,
    ROUND(rc.total_cost_nano / 1000000000.0, 2) as total_cost_usd,
    ROUND(rc.p50_latency::numeric, 0) as median_latency_ms,
    ROUND(rc.p50_throughput::numeric, 2) as median_throughput,
    ROUND(rc.succ_rate::numeric, 4) as success_rate,
    rc.rk::integer as rank,
    COALESCE(rp.rk, 9999)::integer as prev_rank,
    CASE
      WHEN rp.rk IS NULL THEN 'new'
      WHEN rp.rk > rc.rk THEN 'up'
      WHEN rp.rk < rc.rk THEN 'down'
      ELSE 'same'
    END as trend
  FROM ranked_current rc
  LEFT JOIN ranked_previous rp ON rc.model_id = rp.model_id AND rc.provider = rp.provider
  LEFT JOIN previous_period pp ON rc.model_id = pp.model_id AND rc.provider = pp.provider
  WHERE rc.rk <= p_limit
  ORDER BY rc.rk;
END;
$$ LANGUAGE plpgsql STABLE;
