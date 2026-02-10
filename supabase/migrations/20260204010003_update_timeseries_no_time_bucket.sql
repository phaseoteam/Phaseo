-- Replace time_bucket usage with date_trunc to avoid TimescaleDB dependency

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
BEGIN
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '7 days';
  END CASE;

  RETURN QUERY
  WITH top_models AS (
    SELECT COALESCE(gr.model_id, 'Unknown') as model_id
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
    GROUP BY COALESCE(gr.model_id, 'Unknown')
    HAVING COUNT(*) >= 100 -- Privacy threshold
    ORDER BY COUNT(*) DESC
    LIMIT p_top_n
  ),
  bucketed_data AS (
    SELECT
      CASE
        WHEN p_bucket_size = '5min' THEN
          date_trunc('minute', gr.created_at)
          - make_interval(mins => (extract(minute from gr.created_at)::int % 5))
        WHEN p_bucket_size = 'hour' THEN date_trunc('hour', gr.created_at)
        WHEN p_bucket_size = 'day' THEN date_trunc('day', gr.created_at)
        WHEN p_bucket_size = 'week' THEN date_trunc('week', gr.created_at)
        WHEN p_bucket_size = 'month' THEN date_trunc('month', gr.created_at)
        ELSE date_trunc('hour', gr.created_at)
      END as time_bucket,
      CASE
        WHEN COALESCE(gr.model_id, 'Unknown') IN (SELECT model_id FROM top_models)
          THEN COALESCE(gr.model_id, 'Unknown')
        ELSE 'Other'
      END as model_group,
      COUNT(*) as req_count,
      SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
    FROM public.gateway_requests gr
    WHERE gr.created_at >= v_since
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
CREATE OR REPLACE FUNCTION public.get_public_market_share_timeseries(
  p_dimension text DEFAULT 'organization',
  p_time_range text DEFAULT 'year',
  p_bucket_size text DEFAULT 'week',
  p_top_n integer DEFAULT 8
)
RETURNS TABLE (
  bucket timestamp with time zone,
  name text,
  requests bigint,
  tokens bigint
) AS $$
DECLARE
  v_since timestamptz;
BEGIN
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '1 year';
  END CASE;

  IF p_dimension = 'organization' THEN
    RETURN QUERY
    WITH top_groups AS (
      SELECT COALESCE(org.name, 'Unknown') as group_name
      FROM public.gateway_requests gr
      LEFT JOIN public.data_models dm ON gr.model_id = dm.model_id
      LEFT JOIN public.data_organisations org ON dm.organisation_id = org.organisation_id
      WHERE gr.created_at >= v_since
      GROUP BY org.name
      HAVING COUNT(*) >= 100 -- Privacy threshold
      ORDER BY COUNT(*) DESC
      LIMIT p_top_n
    ),
    bucketed AS (
      SELECT
        CASE
          WHEN p_bucket_size = 'hour' THEN date_trunc('hour', gr.created_at)
          WHEN p_bucket_size = 'day' THEN date_trunc('day', gr.created_at)
          WHEN p_bucket_size = 'week' THEN date_trunc('week', gr.created_at)
          WHEN p_bucket_size = 'month' THEN date_trunc('month', gr.created_at)
          ELSE date_trunc('week', gr.created_at)
        END as time_bucket,
        CASE
          WHEN COALESCE(org.name, 'Unknown') IN (SELECT group_name FROM top_groups)
            THEN COALESCE(org.name, 'Unknown')
          ELSE 'Other'
        END as group_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      LEFT JOIN public.data_models dm ON gr.model_id = dm.model_id
      LEFT JOIN public.data_organisations org ON dm.organisation_id = org.organisation_id
      WHERE gr.created_at >= v_since
      GROUP BY time_bucket, group_name
    )
    SELECT
      b.time_bucket,
      b.group_name,
      b.req_count::bigint,
      b.tok_count::bigint
    FROM bucketed b
    ORDER BY b.time_bucket, b.req_count DESC;
  ELSE
    RETURN QUERY
    WITH top_groups AS (
      SELECT COALESCE(gr.provider, 'Unknown') as group_name
      FROM public.gateway_requests gr
      WHERE gr.created_at >= v_since
      GROUP BY gr.provider
      HAVING COUNT(*) >= 100 -- Privacy threshold
      ORDER BY COUNT(*) DESC
      LIMIT p_top_n
    ),
    bucketed AS (
      SELECT
        CASE
          WHEN p_bucket_size = 'hour' THEN date_trunc('hour', gr.created_at)
          WHEN p_bucket_size = 'day' THEN date_trunc('day', gr.created_at)
          WHEN p_bucket_size = 'week' THEN date_trunc('week', gr.created_at)
          WHEN p_bucket_size = 'month' THEN date_trunc('month', gr.created_at)
          ELSE date_trunc('week', gr.created_at)
        END as time_bucket,
        CASE
          WHEN COALESCE(gr.provider, 'Unknown') IN (SELECT group_name FROM top_groups)
            THEN COALESCE(gr.provider, 'Unknown')
          ELSE 'Other'
        END as group_name,
        COUNT(*) as req_count,
        SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
      FROM public.gateway_requests gr
      WHERE gr.created_at >= v_since
      GROUP BY time_bucket, group_name
    )
    SELECT
      b.time_bucket,
      b.group_name,
      b.req_count::bigint,
      b.tok_count::bigint
    FROM bucketed b
    ORDER BY b.time_bucket, b.req_count DESC;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
