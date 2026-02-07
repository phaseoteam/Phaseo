-- Public market share timeseries for stacked charts (weekly buckets)

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
  v_bucket_interval interval;
BEGIN
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '1 year';
  END CASE;

  CASE p_bucket_size
    WHEN 'hour' THEN v_bucket_interval := interval '1 hour';
    WHEN 'day' THEN v_bucket_interval := interval '1 day';
    WHEN 'week' THEN v_bucket_interval := interval '1 week';
    WHEN 'month' THEN v_bucket_interval := interval '1 month';
    ELSE v_bucket_interval := interval '1 week';
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
        time_bucket(v_bucket_interval, gr.created_at) as time_bucket,
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
        time_bucket(v_bucket_interval, gr.created_at) as time_bucket,
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
