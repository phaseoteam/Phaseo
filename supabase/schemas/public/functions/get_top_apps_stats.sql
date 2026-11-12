CREATE OR REPLACE FUNCTION public.get_top_apps_stats (
  p_provider text,
  p_since    timestamp with time zone,
  p_limit    integer                  DEFAULT 20
)
  RETURNS TABLE (
    app_id       text,
    title        text,
    url          text,
    total_tokens bigint
  )
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
BEGIN
    RETURN QUERY
    SELECT
        a.id::text as app_id,
        a.title,
        a.url,
        COALESCE(SUM((gr.usage->>'total_tokens')::bigint), 0)::bigint as total_tokens
    FROM api_apps a
    LEFT JOIN gateway_requests gr ON gr.app_id = a.id
        AND gr.provider = p_provider
        AND gr.created_at >= p_since
        AND gr.success = true
    WHERE a.is_active = true
        AND a.last_seen >= p_since
        AND gr.app_id IS NOT NULL
    GROUP BY a.id, a.title, a.url
    HAVING COALESCE(SUM((gr.usage->>'total_tokens')::bigint), 0) > 0
    ORDER BY total_tokens DESC
    LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_top_apps_stats"(text, timestamp WITH time zone, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_top_apps_stats"(text, timestamp WITH time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_top_apps_stats"(text, timestamp WITH time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_top_apps_stats"(text, timestamp WITH time zone, integer) TO "postgres";
