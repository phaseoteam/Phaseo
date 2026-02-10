-- Resolve api model ids to internal model ids for public rankings RPCs

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
      COUNT(*) as req_count
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
    WHERE gr.created_at >= now() - (p_hours || ' hours')::interval
  )
  SELECT
    r.internal_model_id as model_id,
    r.provider,
    COUNT(*)::bigint as requests,
    CASE
      WHEN SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0)) > 0 THEN
        ROUND(
          (SUM(COALESCE(r.cost_nanos, 0)) / 1000000000.0) /
          (SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0)) / 1000000.0),
          2
        )
      ELSE 0
    END as cost_per_1m_tokens,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.latency_ms)::numeric, 0) as median_latency_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY r.latency_ms)::numeric, 0) as p95_latency_ms,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.throughput)::numeric, 2) as median_throughput,
    ROUND(AVG(CASE WHEN r.success THEN 1.0 ELSE 0.0 END)::numeric, 4) as success_rate
  FROM resolved r
  WHERE r.internal_model_id IS NOT NULL
    AND r.provider IS NOT NULL
    AND r.provider <> ''
  GROUP BY r.internal_model_id, r.provider
  HAVING COUNT(*) >= p_min_requests
  ORDER BY requests DESC;
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
  WITH resolved AS (
    SELECT
      gr.created_at,
      gr.provider,
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
    WHERE gr.created_at >= v_now - interval '21 days'
  ),
  weekly_stats AS (
    SELECT
      r.internal_model_id as model_id,
      r.provider,
      COUNT(*) FILTER (WHERE r.created_at >= v_now - interval '7 days') as week_0,
      COUNT(*) FILTER (WHERE r.created_at >= v_now - interval '14 days'
                          AND r.created_at < v_now - interval '7 days') as week_1,
      COUNT(*) FILTER (WHERE r.created_at >= v_now - interval '21 days'
                          AND r.created_at < v_now - interval '14 days') as week_2
    FROM resolved r
    WHERE r.internal_model_id IS NOT NULL
      AND r.provider IS NOT NULL
      AND r.provider <> ''
    GROUP BY r.internal_model_id, r.provider
    HAVING COUNT(*) FILTER (WHERE r.created_at >= v_now - interval '7 days') >= p_min_requests
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
    WITH resolved AS (
      SELECT
        gr.created_at,
        gr.usage,
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
      WHERE gr.created_at >= v_since
    ),
    totals AS (
      SELECT
        COUNT(*)::numeric as total_requests,
        SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0))::numeric as total_tokens
      FROM resolved r
      WHERE r.internal_model_id IS NOT NULL
    ),
    org_stats AS (
      SELECT
        COALESCE(org.name, dm.organisation_id) as org_name,
        COUNT(*) as req_count,
        SUM(COALESCE((r.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM resolved r
      JOIN public.data_models dm ON dm.model_id = r.internal_model_id
      LEFT JOIN public.data_organisations org ON dm.organisation_id = org.organisation_id
      WHERE r.internal_model_id IS NOT NULL
        AND dm.organisation_id IS NOT NULL
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
        AND provider IS NOT NULL
        AND provider <> ''
    ),
    provider_stats AS (
      SELECT
        gr.provider as prov_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      WHERE gr.created_at >= v_since
        AND gr.provider IS NOT NULL
        AND gr.provider <> ''
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
