-- Update public rankings functions to use rolling 7-day windows for "week"

-- =========================
-- Function: get_public_model_rankings
-- =========================
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
BEGIN
  -- Calculate time ranges
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
    ELSE  -- 'all'
      v_since := '2020-01-01'::timestamptz;
      v_prev_since := v_since;
      v_prev_until := v_since;
  END CASE;

  RETURN QUERY
  WITH current_period AS (
    SELECT
      gr.model_id,
      gr.provider,
      COUNT(*) as req_count,
      SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as total_tok,
      SUM(COALESCE((gr.usage->>'input_tokens')::bigint, 0)) as input_tok,
      SUM(COALESCE((gr.usage->>'output_tokens')::bigint, 0)) as output_tok,
      SUM(COALESCE(gr.cost_nanos, 0)) as total_cost_nano,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gr.latency_ms) as p50_latency,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gr.throughput) as p50_throughput,
      AVG(CASE WHEN gr.success THEN 1.0 ELSE 0.0 END) as succ_rate
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
      AND gr.model_id IS NOT NULL
      AND gr.provider IS NOT NULL
    GROUP BY gr.model_id, gr.provider
    HAVING COUNT(*) >= 100  -- Privacy threshold
  ),
  previous_period AS (
    SELECT
      gr.model_id,
      gr.provider,
      COUNT(*) as req_count
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_prev_since
      AND gr.created_at < v_prev_until
      AND gr.model_id IS NOT NULL
      AND gr.provider IS NOT NULL
    GROUP BY gr.model_id, gr.provider
    HAVING COUNT(*) >= 100  -- Privacy threshold
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
  WHERE rc.rk <= p_limit
  ORDER BY rc.rk;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_market_share
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_market_share(
  p_dimension text DEFAULT 'organization',
  p_time_range text DEFAULT 'week'
)
RETURNS TABLE (
  name text,
  requests bigint,
  tokens bigint,
  share_pct numeric
) AS $$
DECLARE
  v_since timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', v_now);
    WHEN 'week' THEN v_since := v_now - interval '7 days';
    WHEN 'month' THEN v_since := date_trunc('month', v_now);
    ELSE v_since := v_now - interval '7 days';
  END CASE;

  IF p_dimension = 'organization' THEN
    RETURN QUERY
    WITH totals AS (
      SELECT
        COUNT(*)::numeric as total_requests,
        SUM(COALESCE((usage->>'total_tokens')::bigint, 0))::numeric as total_tokens
      FROM public.gateway_requests
      WHERE created_at >= v_since
    ),
    org_stats AS (
      SELECT
        COALESCE(dm.organisation_id, 'Unknown') as org_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      LEFT JOIN public.data_models dm ON gr.model_id = dm.model_id
      WHERE gr.created_at >= v_since
      GROUP BY dm.organisation_id
      HAVING COUNT(*) >= 50  -- Privacy threshold
    )
    SELECT
      os.org_name,
      os.req_count::bigint,
      os.tok_count::bigint,
      ROUND((os.req_count / t.total_requests * 100)::numeric, 2) as share_pct
    FROM org_stats os, totals t
    ORDER BY os.req_count DESC;
  ELSE  -- provider
    RETURN QUERY
    WITH totals AS (
      SELECT
        COUNT(*)::numeric as total_requests,
        SUM(COALESCE((usage->>'total_tokens')::bigint, 0))::numeric as total_tokens
      FROM public.gateway_requests
      WHERE created_at >= v_since
    ),
    provider_stats AS (
      SELECT
        COALESCE(gr.provider, 'Unknown') as prov_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      WHERE gr.created_at >= v_since
      GROUP BY gr.provider
      HAVING COUNT(*) >= 50  -- Privacy threshold
    )
    SELECT
      ps.prov_name,
      ps.req_count::bigint,
      ps.tok_count::bigint,
      ROUND((ps.req_count / t.total_requests * 100)::numeric, 2) as share_pct
    FROM provider_stats ps, totals t
    ORDER BY ps.req_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_trending_models
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_trending_models(
  p_limit integer DEFAULT 20,
  p_min_requests integer DEFAULT 100
)
RETURNS TABLE (
  model_id text,
  provider text,
  current_week_requests bigint,
  previous_week_requests bigint,
  two_weeks_ago_requests bigint,
  velocity numeric,
  momentum_score numeric
) AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  RETURN QUERY
  WITH weekly_stats AS (
    SELECT
      gr.model_id,
      gr.provider,
      COUNT(*) FILTER (WHERE gr.created_at >= v_now - interval '7 days') as week_0,
      COUNT(*) FILTER (WHERE gr.created_at >= v_now - interval '14 days'
                          AND gr.created_at < v_now - interval '7 days') as week_1,
      COUNT(*) FILTER (WHERE gr.created_at >= v_now - interval '21 days'
                          AND gr.created_at < v_now - interval '14 days') as week_2
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_now - interval '21 days'
      AND gr.model_id IS NOT NULL
      AND gr.provider IS NOT NULL
    GROUP BY gr.model_id, gr.provider
    HAVING COUNT(*) FILTER (WHERE gr.created_at >= v_now - interval '7 days') >= p_min_requests
  )
  SELECT
    ws.model_id,
    ws.provider,
    ws.week_0::bigint,
    ws.week_1::bigint,
    ws.week_2::bigint,
    ((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2))::numeric as velocity,
    (((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2)) * 2.0 + (ws.week_0 - ws.week_1))::numeric as momentum_score
  FROM weekly_stats ws
  WHERE ws.week_0 > ws.week_1
  ORDER BY momentum_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
