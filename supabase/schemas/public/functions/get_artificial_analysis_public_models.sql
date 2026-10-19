CREATE OR REPLACE FUNCTION public.get_artificial_analysis_public_models(
  p_model_slug text DEFAULT NULL, p_major integer DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  WITH snapshot AS (
    SELECT * FROM public.artificial_analysis_public_snapshots
    WHERE p_major IS NULL OR major_version = p_major
    ORDER BY major_version DESC, fetched_at DESC LIMIT 1
  ), visible AS (
    SELECT m.value - 'sourceData' || jsonb_build_object('model_id', model.model_slug) AS data, m.value->>'id' AS source_id
    FROM snapshot s
    CROSS JOIN LATERAL jsonb_array_elements(s.payload->'models') m
    JOIN LATERAL jsonb_array_elements(s.payload->'matching'->'sources') owner ON owner.value->>'id' = m.value->>'id'
    JOIN public.v2_models model ON model.model_slug = owner.value->>'model_id' AND NOT coalesce(model.hidden, false)
    WHERE p_model_slug IS NULL OR model.model_slug = p_model_slug
  )
  SELECT jsonb_build_object(
    'snapshot_id', s.snapshot_id, 'methodology_version', s.methodology_version, 'fetched_at', s.fetched_at,
    'source_url', s.payload->>'sourceUrl', 'total', (SELECT count(*) FROM visible),
    'models', coalesce((SELECT jsonb_agg(page.data ORDER BY page.source_id) FROM (
      SELECT * FROM visible ORDER BY source_id LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, least(coalesce(p_offset, 0), 10000))
    ) page), '[]'::jsonb)
  ) FROM snapshot s;
$function$;
REVOKE ALL ON FUNCTION public.get_artificial_analysis_public_models(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_artificial_analysis_public_models(text, integer, integer, integer) TO service_role;
