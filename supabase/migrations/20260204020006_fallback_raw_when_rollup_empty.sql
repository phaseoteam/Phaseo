-- Fallback to raw gateway_requests when rollup tables are empty

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
  v_rollup_count bigint;
BEGIN
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '7 days';
  END CASE;

  IF p_bucket_size = 'week' THEN
    SELECT COUNT(*)
    INTO v_rollup_count
    FROM public.public_usage_weekly_models
    WHERE bucket >= date_trunc('week', v_since);

    IF v_rollup_count > 0 THEN
      RETURN QUERY
      WITH base AS (
        SELECT *
        FROM public.public_usage_weekly_models
        WHERE bucket >= date_trunc('week', v_since)
      ),
      top_models AS (
        SELECT model_id
        FROM base
        GROUP BY model_id
        ORDER BY SUM(requests) DESC
        LIMIT p_top_n
      ),
      bucketed AS (
        SELECT
          bucket as time_bucket,
          CASE
            WHEN model_id IN (SELECT model_id FROM top_models) THEN model_id
            ELSE 'Other'
          END as model_group,
          SUM(requests) as req_count,
          SUM(tokens) as tok_count
        FROM base
        GROUP BY time_bucket, model_group
      )
      SELECT
        b.time_bucket,
        b.model_group,
        b.req_count::bigint,
        b.tok_count::bigint
      FROM bucketed b
      ORDER BY b.time_bucket, b.req_count DESC;

      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  WITH bucketed_data AS (
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
      coalesce(gr.model_id, 'Unknown') as model_group,
      count(*) as req_count,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
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
  v_rollup_count bigint;
BEGIN
  CASE p_time_range
    WHEN '24h' THEN v_since := now() - interval '24 hours';
    WHEN 'week' THEN v_since := now() - interval '7 days';
    WHEN 'month' THEN v_since := now() - interval '30 days';
    WHEN 'year' THEN v_since := now() - interval '1 year';
    ELSE v_since := now() - interval '1 year';
  END CASE;

  IF p_bucket_size = 'week' THEN
    IF p_dimension = 'organization' THEN
      SELECT COUNT(*)
      INTO v_rollup_count
      FROM public.public_usage_weekly_organisations
      WHERE bucket >= date_trunc('week', v_since);

      IF v_rollup_count > 0 THEN
        RETURN QUERY
        WITH base AS (
          SELECT *
          FROM public.public_usage_weekly_organisations
          WHERE bucket >= date_trunc('week', v_since)
        ),
        top_groups AS (
          SELECT organisation_name as group_name
          FROM base
          GROUP BY organisation_name
          ORDER BY SUM(requests) DESC
          LIMIT p_top_n
        ),
        bucketed AS (
          SELECT
            bucket as time_bucket,
            CASE
              WHEN organisation_name IN (SELECT group_name FROM top_groups) THEN organisation_name
              ELSE 'Other'
            END as group_name,
            SUM(requests) as req_count,
            SUM(tokens) as tok_count
          FROM base
          GROUP BY time_bucket, group_name
        )
        SELECT
          b.time_bucket,
          b.group_name,
          b.req_count::bigint,
          b.tok_count::bigint
        FROM bucketed b
        ORDER BY b.time_bucket, b.req_count DESC;

        RETURN;
      END IF;
    ELSE
      SELECT COUNT(*)
      INTO v_rollup_count
      FROM public.public_usage_weekly_providers
      WHERE bucket >= date_trunc('week', v_since);

      IF v_rollup_count > 0 THEN
        RETURN QUERY
        WITH base AS (
          SELECT *
          FROM public.public_usage_weekly_providers
          WHERE bucket >= date_trunc('week', v_since)
        ),
        top_groups AS (
          SELECT provider as group_name
          FROM base
          GROUP BY provider
          ORDER BY SUM(requests) DESC
          LIMIT p_top_n
        ),
        bucketed AS (
          SELECT
            bucket as time_bucket,
            CASE
              WHEN provider IN (SELECT group_name FROM top_groups) THEN provider
              ELSE 'Other'
            END as group_name,
            SUM(requests) as req_count,
            SUM(tokens) as tok_count
          FROM base
          GROUP BY time_bucket, group_name
        )
        SELECT
          b.time_bucket,
          b.group_name,
          b.req_count::bigint,
          b.tok_count::bigint
        FROM bucketed b
        ORDER BY b.time_bucket, b.req_count DESC;

        RETURN;
      END IF;
    END IF;
  END IF;

  IF p_dimension = 'organization' THEN
    RETURN QUERY
    WITH bucketed AS (
      SELECT
        CASE
          WHEN p_bucket_size = 'hour' THEN date_trunc('hour', gr.created_at)
          WHEN p_bucket_size = 'day' THEN date_trunc('day', gr.created_at)
          WHEN p_bucket_size = 'week' THEN date_trunc('week', gr.created_at)
          WHEN p_bucket_size = 'month' THEN date_trunc('month', gr.created_at)
          ELSE date_trunc('week', gr.created_at)
        END as time_bucket,
        coalesce(org.name, dm.organisation_id, 'Unknown') as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
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
    WITH bucketed AS (
      SELECT
        CASE
          WHEN p_bucket_size = 'hour' THEN date_trunc('hour', gr.created_at)
          WHEN p_bucket_size = 'day' THEN date_trunc('day', gr.created_at)
          WHEN p_bucket_size = 'week' THEN date_trunc('week', gr.created_at)
          WHEN p_bucket_size = 'month' THEN date_trunc('month', gr.created_at)
          ELSE date_trunc('week', gr.created_at)
        END as time_bucket,
        coalesce(gr.provider, 'Unknown') as group_name,
        count(*) as req_count,
        sum(coalesce((gr.usage->>'total_tokens')::bigint, 0)) as tok_count
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
