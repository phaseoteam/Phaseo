CREATE OR REPLACE FUNCTION public.get_artificial_analysis_coverage()
RETURNS TABLE (benchmark_id text, total_models bigint, published boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  WITH publications AS (
    SELECT DISTINCT ON (major_version) major_version, methodology_version
    FROM public.artificial_analysis_snapshots ORDER BY major_version, fetched_at DESC
  )
  SELECT b.benchmark_id, count(DISTINCT r.model_slug), s.major_version IS NOT NULL
  FROM public.v2_benchmarks b
  LEFT JOIN publications s ON s.major_version = substring(b.benchmark_id FROM '-v([1-9][0-9]*)$')::integer
  LEFT JOIN public.v2_benchmark_results r ON r.benchmark_id = b.benchmark_id
    AND (r.effective_to IS NULL OR r.effective_to > now())
    AND r.score_numeric IS NOT NULL
    AND r.score_numeric NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND (s.major_version IS NULL OR substring(r.other_info FROM 'Intelligence Index v([0-9]+\.[0-9]+(?:\.[0-9]+)?)') = s.methodology_version)
    AND EXISTS (SELECT 1 FROM public.v2_models m WHERE m.model_slug = r.model_slug AND m.hidden = false)
  WHERE b.benchmark_id LIKE 'aa-%' OR b.benchmark_id = 'artificial-analysis'
  GROUP BY b.benchmark_id, s.major_version;
$function$;
REVOKE ALL ON FUNCTION public.get_artificial_analysis_coverage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_artificial_analysis_coverage() TO service_role, postgres;
