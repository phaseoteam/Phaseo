-- Update public usage timeseries function for weekly buckets and stricter privacy thresholds

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
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '7 days';
  END CASE;

  CASE p_bucket_size
    WHEN '5min' THEN v_bucket_interval := interval '5 minutes';
    WHEN 'hour' THEN v_bucket_interval := interval '1 hour';
    WHEN 'day' THEN v_bucket_interval := interval '1 day';
    WHEN 'week' THEN v_bucket_interval := interval '1 week';
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
    HAVING COUNT(*) >= 100 -- Privacy threshold
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
