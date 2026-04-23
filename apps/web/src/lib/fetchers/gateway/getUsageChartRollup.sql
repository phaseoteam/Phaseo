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
        gr.created_at,
        COALESCE(NULLIF(gr.provider, ''), 'unknown') AS provider,
        COALESCE(
            NULLIF(gr.canonical_model_id, ''),
            public.resolve_public_model_id(gr.model_id, gr.provider),
            NULLIF(gr.model_id, ''),
            'unknown'
        ) AS model_id,
        1::bigint AS requests,
        public.gateway_usage_total_tokens(gr.usage)::bigint AS total_tokens,
        COALESCE(gr.cost_nanos, 0)::bigint AS total_cost_nanos
    FROM public.gateway_requests gr
    WHERE gr.workspace_id = p_team
      AND gr.success IS TRUE
      AND gr.created_at >= p_from
      AND gr.created_at <= p_to
      AND (p_key_id IS NULL OR gr.key_id = p_key_id)
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
