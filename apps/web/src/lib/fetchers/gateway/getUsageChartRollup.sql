CREATE OR REPLACE FUNCTION get_usage_chart_rollup(
    p_team uuid,
    p_from timestamp with time zone,
    p_to timestamp with time zone,
    p_bucket text,
    p_key_id uuid default null
)
RETURNS TABLE(
    bucket timestamp with time zone,
    provider text,
    model_id text,
    requests bigint,
    tokens bigint,
    cost numeric
) AS $$
WITH base AS (
    SELECT
        r.bucket_15m AS created_at,
        r.provider,
        r.canonical_model_id AS model_id,
        r.requests,
        r.total_tokens,
        r.total_cost_nanos
    FROM public.gateway_usage_rollup_15m_workspace_provider_model r
    WHERE r.workspace_id = p_team
      AND r.bucket_15m >= p_from
      AND r.bucket_15m <= p_to
      AND (p_key_id IS NULL OR r.key_id = p_key_id)
),
bucketed AS (
    SELECT
        CASE
            WHEN p_bucket = '5min' THEN
                date_trunc('minute', created_at)
                - make_interval(mins => (extract(minute from created_at)::int % 5))
            WHEN p_bucket = 'hour' THEN date_trunc('hour', created_at)
            WHEN p_bucket = 'day' THEN date_trunc('day', created_at)
            WHEN p_bucket = 'month' THEN date_trunc('month', created_at)
            ELSE date_trunc('day', created_at)
        END AS bucket,
        COALESCE(provider, 'unknown') AS provider,
        COALESCE(model_id, 'unknown') AS model_id,
        COALESCE(requests, 0)::bigint AS requests,
        COALESCE(total_tokens, 0)::bigint AS tokens,
        COALESCE(total_cost_nanos, 0)::numeric / 1e9 AS cost
    FROM base
)
SELECT
    bucket,
    provider,
    model_id,
    SUM(requests)::bigint AS requests,
    SUM(tokens)::bigint AS tokens,
    SUM(cost)::numeric AS cost
FROM bucketed
GROUP BY bucket, provider, model_id
ORDER BY bucket ASC;
$$ LANGUAGE sql STABLE;
