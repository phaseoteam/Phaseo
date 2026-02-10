-- Remove privacy thresholds for public rankings RPCs (useful for low-volume environments)

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
CREATE OR REPLACE FUNCTION public.get_public_model_performance(
  p_hours integer DEFAULT 24,
  p_min_requests integer DEFAULT 0
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
  HAVING COUNT(*) >= p_min_requests
  ORDER BY requests DESC;
END;
$$ LANGUAGE plpgsql STABLE;
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
        COALESCE(org.name, dm.organisation_id, 'Unknown') as org_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      LEFT JOIN public.data_models dm ON gr.model_id = dm.model_id
      LEFT JOIN public.data_organisations org ON dm.organisation_id = org.organisation_id
      WHERE gr.created_at >= v_since
      GROUP BY org.name, dm.organisation_id
    )
    SELECT
      os.org_name,
      os.req_count::bigint,
      os.tok_count::bigint,
      ROUND((os.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    FROM org_stats os, totals t
    ORDER BY os.req_count DESC;
  ELSE
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
    )
    SELECT
      ps.prov_name,
      ps.req_count::bigint,
      ps.tok_count::bigint,
      ROUND((ps.req_count / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
    FROM provider_stats ps, totals t
    ORDER BY ps.req_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION public.get_public_trending_models(
  p_limit integer DEFAULT 20,
  p_min_requests integer DEFAULT 0
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
  v_now timestamptz := now();
BEGIN
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', v_now);
    WHEN 'week' THEN v_since := v_now - interval '7 days';
    WHEN 'month' THEN v_since := date_trunc('month', v_now);
    ELSE v_since := v_now - interval '7 days';
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
  ORDER BY requests DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
CREATE OR REPLACE FUNCTION public.get_public_reliability_metrics(
  p_time_range text DEFAULT 'week',
  p_min_requests integer DEFAULT 0
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
  v_now timestamptz := now();
BEGIN
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', v_now);
    WHEN 'week' THEN v_since := v_now - interval '7 days';
    WHEN 'month' THEN v_since := date_trunc('month', v_now);
    ELSE v_since := v_now - interval '7 days';
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
  HAVING COUNT(*) >= p_min_requests
  ORDER BY success_rate ASC, total_requests DESC;
END;
$$ LANGUAGE plpgsql STABLE;
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
  v_now timestamptz := now();
BEGIN
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', v_now);
    WHEN 'week' THEN v_since := v_now - interval '7 days';
    WHEN 'month' THEN v_since := date_trunc('month', v_now);
    ELSE v_since := v_now - interval '7 days';
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
    ROUND((COUNT(*) / nullif(t.total_requests, 0) * 100)::numeric, 2) as share_pct
  FROM public.gateway_requests gr, totals t
  WHERE gr.created_at >= v_since
  GROUP BY gr.location
  ORDER BY requests DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
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
  v_now timestamptz := now();
BEGIN
  CASE p_time_range
    WHEN 'today' THEN v_since := date_trunc('day', v_now);
    WHEN 'week' THEN v_since := v_now - interval '7 days';
    WHEN 'month' THEN v_since := date_trunc('month', v_now);
    ELSE v_since := v_now - interval '7 days';
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
  HAVING (
    SUM(COALESCE((gr.usage->>'audio_input_tokens')::bigint, 0)) > 0 OR
    SUM(COALESCE((gr.usage->>'video_input_tokens')::bigint, 0)) > 0 OR
    SUM(COALESCE((gr.usage->>'image_count')::bigint, 0)) > 0
  )
  ORDER BY (text_tokens + audio_tokens + video_tokens) DESC;
END;
$$ LANGUAGE plpgsql STABLE;
