CREATE OR REPLACE FUNCTION public.get_public_geographic_distribution (
  p_time_range text    DEFAULT 'week'::text,
  p_limit      integer DEFAULT 20
)
  RETURNS TABLE (
    country      text,
    country_code text,
    requests     bigint,
    tokens       bigint,
    share_pct    numeric
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
  WITH totals AS (
    SELECT COUNT(*)::numeric as total_requests
    FROM private.v2_rpc_gateway_requests_compat
    WHERE created_at >= v_since
  )
  SELECT
    COALESCE(gr.location, 'Unknown') as country,
    COALESCE(gr.location, 'XX') as country_code,
    COUNT(*)::bigint as requests,
    SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    ROUND((COUNT(*) / t.total_requests * 100)::numeric, 2) as share_pct
  FROM private.v2_rpc_gateway_requests_compat gr, totals t
  WHERE gr.created_at >= v_since
  GROUP BY gr.location
  HAVING COUNT(*) >= 50
  ORDER BY requests DESC
  LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_geographic_distribution"(text, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_geographic_distribution"(text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_geographic_distribution"(text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_geographic_distribution"(text, integer) TO "postgres";
