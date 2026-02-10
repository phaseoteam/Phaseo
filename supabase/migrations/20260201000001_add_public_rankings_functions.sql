-- =========================
-- Public Rankings SQL RPC Functions
-- =========================
-- Privacy-first aggregation across all teams for public rankings page
-- All functions apply minimum thresholds to prevent exposing individual team data

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_gateway_requests_model_created
  ON public.gateway_requests(model_id, created_at) WHERE model_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_requests_provider_created
  ON public.gateway_requests(provider, created_at) WHERE provider IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_requests_app_created
  ON public.gateway_requests(app_id, created_at) WHERE app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_requests_success_created
  ON public.gateway_requests(success, created_at);
-- =========================
-- Function: get_public_model_rankings
-- Returns: Top models by metric (tokens, requests, cost) for time range
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
BEGIN
  -- Calculate time ranges
  CASE p_time_range
    WHEN 'today' THEN
      v_since := date_trunc('day', now());
      v_prev_since := v_since - interval '1 day';
      v_prev_until := v_since;
    WHEN 'week' THEN
      v_since := date_trunc('week', now());
      v_prev_since := v_since - interval '1 week';
      v_prev_until := v_since;
    WHEN 'month' THEN
      v_since := date_trunc('month', now());
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
-- Function: get_public_usage_timeseries
-- Returns: Time-bucketed usage for charting
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_usage_timeseries(
  p_time_range text DEFAULT 'week',
  p_bucket_size text DEFAULT 'hour',
  p_top_n integer DEFAULT 10
)
RETURNS TABLE (
  bucket timestamp with time zone,
  model_id text,
  requests bigint,
  tokens bigint
) AS $$
DECLARE
  v_since timestamptz;
  v_bucket_interval interval;
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '7 days';
  END CASE;

  -- Calculate bucket interval
  CASE p_bucket_size
    WHEN '5min' THEN v_bucket_interval := interval '5 minutes';
    WHEN 'hour' THEN v_bucket_interval := interval '1 hour';
    WHEN 'day' THEN v_bucket_interval := interval '1 day';
    WHEN 'month' THEN v_bucket_interval := interval '1 month';
    ELSE v_bucket_interval := interval '1 hour';
  END CASE;

  RETURN QUERY
  WITH top_models AS (
    SELECT gr.model_id
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
      AND gr.model_id IS NOT NULL
    GROUP BY gr.model_id
    ORDER BY COUNT(*) DESC
    LIMIT p_top_n
  ),
  bucketed_data AS (
    SELECT
      time_bucket(v_bucket_interval, gr.created_at) as time_bucket,
      CASE
        WHEN gr.model_id IN (SELECT model_id FROM top_models) THEN gr.model_id
        ELSE 'Other'
      END as model_group,
      COUNT(*) as req_count,
      SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
      AND gr.model_id IS NOT NULL
    GROUP BY time_bucket, model_group
  )
  SELECT
    bd.time_bucket,
    bd.model_group,
    bd.req_count::bigint,
    bd.tok_count::bigint
  FROM bucketed_data bd
  ORDER BY bd.time_bucket, bd.req_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_model_performance
-- Returns: Cost, throughput, latency for scatter chart (last 24h)
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_model_performance(
  p_hours integer DEFAULT 24,
  p_min_requests integer DEFAULT 100
)
RETURNS TABLE (
  model_id text,
  provider text,
  requests bigint,
  cost_per_1m_tokens numeric,
  median_latency_ms numeric,
  p95_latency_ms numeric,
  median_throughput numeric,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gr.model_id,
    gr.provider,
    COUNT(*)::bigint as requests,
    CASE
      WHEN SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) > 0 THEN
        ROUND(
          (SUM(COALESCE(gr.cost_nanos, 0)) / 1000000000.0) /
          (SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) / 1000000.0),
          2
        )
      ELSE 0
    END as cost_per_1m_tokens,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gr.latency_ms)::numeric, 0) as median_latency_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY gr.latency_ms)::numeric, 0) as p95_latency_ms,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gr.throughput)::numeric, 2) as median_throughput,
    ROUND(AVG(CASE WHEN gr.success THEN 1.0 ELSE 0.0 END)::numeric, 4) as success_rate
  FROM public.gateway_requests gr
  WHERE gr.created_at >= now() - (p_hours || ' hours')::interval
    AND gr.model_id IS NOT NULL
    AND gr.provider IS NOT NULL
  GROUP BY gr.model_id, gr.provider
  HAVING COUNT(*) >= p_min_requests  -- Privacy threshold
  ORDER BY requests DESC;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_market_share
-- Returns: Organization/provider market share
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
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', now());
    WHEN 'week' THEN v_since := date_trunc('week', now());
    WHEN 'month' THEN v_since := date_trunc('month', now());
    ELSE v_since := date_trunc('week', now());
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
-- Returns: Models with highest velocity (rate of change over time)
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
BEGIN
  RETURN QUERY
  WITH weekly_stats AS (
    SELECT
      gr.model_id,
      gr.provider,
      COUNT(*) FILTER (WHERE gr.created_at >= date_trunc('week', now())) as week_0,
      COUNT(*) FILTER (WHERE gr.created_at >= date_trunc('week', now()) - interval '1 week'
                          AND gr.created_at < date_trunc('week', now())) as week_1,
      COUNT(*) FILTER (WHERE gr.created_at >= date_trunc('week', now()) - interval '2 weeks'
                          AND gr.created_at < date_trunc('week', now()) - interval '1 week') as week_2
    FROM public.gateway_requests gr
    WHERE gr.created_at >= date_trunc('week', now()) - interval '2 weeks'
      AND gr.model_id IS NOT NULL
      AND gr.provider IS NOT NULL
    GROUP BY gr.model_id, gr.provider
    HAVING COUNT(*) FILTER (WHERE gr.created_at >= date_trunc('week', now())) >= p_min_requests
  )
  SELECT
    ws.model_id,
    ws.provider,
    ws.week_0::bigint,
    ws.week_1::bigint,
    ws.week_2::bigint,
    -- Velocity: (current - previous) - (previous - two_weeks_ago)
    -- Positive = accelerating growth, Negative = decelerating
    ((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2))::numeric as velocity,
    -- Momentum score: velocity weighted by recency (current week gets 2x weight)
    (((ws.week_0 - ws.week_1) - (ws.week_1 - ws.week_2)) * 2.0 + (ws.week_0 - ws.week_1))::numeric as momentum_score
  FROM weekly_stats ws
  WHERE ws.week_0 > ws.week_1  -- Only show growing models
  ORDER BY momentum_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_top_apps
-- Returns: Top applications by usage (anonymized)
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_top_apps(
  p_limit integer DEFAULT 20,
  p_time_range text DEFAULT 'week'
)
RETURNS TABLE (
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
) AS $$
DECLARE
  v_since timestamptz;
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', now());
    WHEN 'week' THEN v_since := date_trunc('week', now());
    WHEN 'month' THEN v_since := date_trunc('month', now());
    ELSE v_since := date_trunc('week', now());
  END CASE;

  RETURN QUERY
  SELECT
    COALESCE(aa.title, 'App-' || SUBSTRING(MD5(aa.id::text), 1, 8)) as app_name,
    COUNT(*)::bigint as requests,
    SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    COUNT(DISTINCT gr.model_id)::integer as unique_models
  FROM public.gateway_requests gr
  LEFT JOIN public.api_apps aa ON gr.app_id = aa.id
  WHERE gr.created_at >= v_since
    AND gr.app_id IS NOT NULL
  GROUP BY aa.id, aa.title
  HAVING COUNT(*) >= 100  -- Privacy threshold
  ORDER BY requests DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_reliability_metrics
-- Returns: Success rates and error distributions
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_reliability_metrics(
  p_time_range text DEFAULT 'week',
  p_min_requests integer DEFAULT 100
)
RETURNS TABLE (
  model_id text,
  provider text,
  total_requests bigint,
  successful_requests bigint,
  success_rate numeric,
  median_latency_ms numeric,
  p95_latency_ms numeric,
  p99_latency_ms numeric,
  common_errors jsonb
) AS $$
DECLARE
  v_since timestamptz;
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', now());
    WHEN 'week' THEN v_since := date_trunc('week', now());
    WHEN 'month' THEN v_since := date_trunc('month', now());
    ELSE v_since := date_trunc('week', now());
  END CASE;

  RETURN QUERY
  WITH error_aggregates AS (
    SELECT
      gr.model_id,
      gr.provider,
      jsonb_agg(
        jsonb_build_object(
          'error_code', gr.error_code,
          'count', error_count
        ) ORDER BY error_count DESC
      ) FILTER (WHERE gr.error_code IS NOT NULL) as errors
    FROM public.gateway_requests gr
    CROSS JOIN LATERAL (
      SELECT COUNT(*) as error_count
      FROM public.gateway_requests gr2
      WHERE gr2.model_id = gr.model_id
        AND gr2.provider = gr.provider
        AND gr2.error_code = gr.error_code
        AND gr2.created_at >= v_since
    ) ec
    WHERE gr.created_at >= v_since
      AND gr.error_code IS NOT NULL
    GROUP BY gr.model_id, gr.provider
  )
  SELECT
    gr.model_id,
    gr.provider,
    COUNT(*)::bigint as total_requests,
    COUNT(*) FILTER (WHERE gr.success)::bigint as successful_requests,
    ROUND(AVG(CASE WHEN gr.success THEN 1.0 ELSE 0.0 END)::numeric, 4) as success_rate,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gr.latency_ms)::numeric, 0) as median_latency_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY gr.latency_ms)::numeric, 0) as p95_latency_ms,
    ROUND(percentile_cont(0.99) WITHIN GROUP (ORDER BY gr.latency_ms)::numeric, 0) as p99_latency_ms,
    COALESCE(ea.errors, '[]'::jsonb) as common_errors
  FROM public.gateway_requests gr
  LEFT JOIN error_aggregates ea ON gr.model_id = ea.model_id AND gr.provider = ea.provider
  WHERE gr.created_at >= v_since
    AND gr.model_id IS NOT NULL
    AND gr.provider IS NOT NULL
  GROUP BY gr.model_id, gr.provider, ea.errors
  HAVING COUNT(*) >= p_min_requests  -- Privacy threshold
  ORDER BY success_rate ASC, total_requests DESC;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_geographic_distribution
-- Returns: Request distribution by country (for bar chart)
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_geographic_distribution(
  p_time_range text DEFAULT 'week',
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  country text,
  country_code text,
  requests bigint,
  tokens bigint,
  share_pct numeric
) AS $$
DECLARE
  v_since timestamptz;
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', now());
    WHEN 'week' THEN v_since := date_trunc('week', now());
    WHEN 'month' THEN v_since := date_trunc('month', now());
    ELSE v_since := date_trunc('week', now());
  END CASE;

  RETURN QUERY
  WITH totals AS (
    SELECT COUNT(*)::numeric as total_requests
    FROM public.gateway_requests
    WHERE created_at >= v_since
  )
  SELECT
    COALESCE(gr.location, 'Unknown') as country,
    COALESCE(gr.location, 'XX') as country_code,
    COUNT(*)::bigint as requests,
    SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    ROUND((COUNT(*) / t.total_requests * 100)::numeric, 2) as share_pct
  FROM public.gateway_requests gr, totals t
  WHERE gr.created_at >= v_since
  GROUP BY gr.location
  HAVING COUNT(*) >= 50  -- Privacy threshold
  ORDER BY requests DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_multimodal_breakdown
-- Returns: Token distribution by modality
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_multimodal_breakdown(
  p_time_range text DEFAULT 'week'
)
RETURNS TABLE (
  model_id text,
  text_tokens bigint,
  audio_tokens bigint,
  video_tokens bigint,
  cached_tokens bigint,
  image_count bigint
) AS $$
DECLARE
  v_since timestamptz;
BEGIN
  -- Calculate time range
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', now());
    WHEN 'week' THEN v_since := date_trunc('week', now());
    WHEN 'month' THEN v_since := date_trunc('month', now());
    ELSE v_since := date_trunc('week', now());
  END CASE;

  RETURN QUERY
  SELECT
    gr.model_id,
    SUM(COALESCE((gr.usage->>'text_input_tokens')::bigint, 0) +
        COALESCE((gr.usage->>'text_output_tokens')::bigint, 0) +
        COALESCE((gr.usage->>'input_tokens')::bigint, 0) +
        COALESCE((gr.usage->>'output_tokens')::bigint, 0))::bigint as text_tokens,
    SUM(COALESCE((gr.usage->>'audio_input_tokens')::bigint, 0) +
        COALESCE((gr.usage->>'audio_output_tokens')::bigint, 0))::bigint as audio_tokens,
    SUM(COALESCE((gr.usage->>'video_input_tokens')::bigint, 0))::bigint as video_tokens,
    SUM(COALESCE((gr.usage->>'cached_tokens')::bigint, 0))::bigint as cached_tokens,
    SUM(COALESCE((gr.usage->>'image_count')::bigint, 0))::bigint as image_count
  FROM public.gateway_requests gr
  WHERE gr.created_at >= v_since
    AND gr.model_id IS NOT NULL
  GROUP BY gr.model_id
  HAVING COUNT(*) >= 100  -- Privacy threshold
    AND (
      SUM(COALESCE((gr.usage->>'audio_input_tokens')::bigint, 0)) > 0 OR
      SUM(COALESCE((gr.usage->>'video_input_tokens')::bigint, 0)) > 0 OR
      SUM(COALESCE((gr.usage->>'image_count')::bigint, 0)) > 0
    )
  ORDER BY (text_tokens + audio_tokens + video_tokens) DESC;
END;
$$ LANGUAGE plpgsql STABLE;
-- =========================
-- Function: get_public_summary_stats
-- Returns: Overall gateway statistics
-- =========================
CREATE OR REPLACE FUNCTION public.get_public_summary_stats()
RETURNS TABLE (
  total_requests_24h bigint,
  total_tokens_24h bigint,
  total_models integer,
  total_providers integer,
  avg_latency_ms numeric,
  success_rate_24h numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_requests_24h,
    SUM(COALESCE((usage->>'total_tokens')::bigint, 0))::bigint as total_tokens_24h,
    COUNT(DISTINCT model_id)::integer as total_models,
    COUNT(DISTINCT provider)::integer as total_providers,
    ROUND(AVG(latency_ms)::numeric, 0) as avg_latency_ms,
    ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)::numeric, 4) as success_rate_24h
  FROM public.gateway_requests
  WHERE created_at >= now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql STABLE;
-- Add comments for documentation
COMMENT ON FUNCTION public.get_public_model_rankings IS 'Public rankings of models by usage metrics with trend indicators';
COMMENT ON FUNCTION public.get_public_usage_timeseries IS 'Time-series usage data for top N models with bucketing';
COMMENT ON FUNCTION public.get_public_model_performance IS 'Performance metrics (cost, latency, throughput) for scatter charts';
COMMENT ON FUNCTION public.get_public_market_share IS 'Market share breakdown by organization or provider';
COMMENT ON FUNCTION public.get_public_trending_models IS 'Models with highest velocity/momentum (accelerating growth)';
COMMENT ON FUNCTION public.get_public_top_apps IS 'Top applications by usage (anonymized for privacy)';
COMMENT ON FUNCTION public.get_public_reliability_metrics IS 'Reliability metrics including success rates and error distributions';
COMMENT ON FUNCTION public.get_public_geographic_distribution IS 'Request distribution by country/region';
COMMENT ON FUNCTION public.get_public_multimodal_breakdown IS 'Token distribution across text, audio, video, and cached content';
COMMENT ON FUNCTION public.get_public_summary_stats IS 'Overall gateway statistics for summary cards';
