CREATE OR REPLACE FUNCTION public.get_public_reliability_metrics (
  p_time_range   text    DEFAULT 'week'::text,
  p_min_requests integer DEFAULT 100
)
  RETURNS TABLE (
    model_id            text,
    provider            text,
    total_requests      bigint,
    successful_requests bigint,
    success_rate        numeric,
    median_latency_ms   numeric,
    p95_latency_ms      numeric,
    p99_latency_ms      numeric,
    common_errors       jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
    FROM private.v2_rpc_gateway_requests_compat gr
    CROSS JOIN LATERAL (
      SELECT COUNT(*) as error_count
      FROM private.v2_rpc_gateway_requests_compat gr2
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
  FROM private.v2_rpc_gateway_requests_compat gr
  LEFT JOIN error_aggregates ea ON gr.model_id = ea.model_id AND gr.provider = ea.provider
  WHERE gr.created_at >= v_since
    AND gr.model_id IS NOT NULL
    AND gr.provider IS NOT NULL
  GROUP BY gr.model_id, gr.provider, ea.errors
  HAVING COUNT(*) >= p_min_requests
  ORDER BY success_rate ASC, total_requests DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_reliability_metrics"(text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_reliability_metrics"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_reliability_metrics"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_reliability_metrics"(text, integer) TO "postgres";
