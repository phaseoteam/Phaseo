-- Include app_id in public top apps RPC and order by token usage

DROP FUNCTION IF EXISTS public.get_public_top_apps(integer, text);
CREATE OR REPLACE FUNCTION public.get_public_top_apps(
  p_limit integer DEFAULT 20,
  p_time_range text DEFAULT 'week'
)
RETURNS TABLE (
  app_id text,
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
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

  RETURN QUERY
  SELECT
    gr.app_id::text as app_id,
    COALESCE(aa.title, 'App-' || SUBSTRING(MD5(gr.app_id::text), 1, 8)) as app_name,
    COUNT(*)::bigint as requests,
    SUM(COALESCE((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    COUNT(DISTINCT gr.model_id)::integer as unique_models
  FROM public.gateway_requests gr
  LEFT JOIN public.api_apps aa ON gr.app_id = aa.id
  WHERE gr.created_at >= v_since
    AND gr.app_id IS NOT NULL
  GROUP BY gr.app_id, aa.title
  ORDER BY tokens DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
