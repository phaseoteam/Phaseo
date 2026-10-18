-- Bootstrap only the v4.3.2 import verified before this release. Never infer
-- completion from the highest methodology present in an intelligence row.
DO $bootstrap$
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('artificial-analysis-publication', 0));
IF EXISTS (SELECT 1 FROM public.artificial_analysis_snapshots) THEN RETURN; END IF;
-- Legacy per-model importers do not take the publication lock. Freeze their
-- projection while checking the precondition and capturing the initial payload.
LOCK TABLE public.v2_benchmarks, public.v2_benchmark_results IN SHARE MODE;
IF EXISTS (
  SELECT 1 FROM public.v2_benchmark_results r
  WHERE r.benchmark_id ~ '^aa-(intelligence|coding|agentic)-index(-cost)?-v[1-9][0-9]*$'
    AND (r.effective_to IS NULL OR r.effective_to > now())
    AND r.score_numeric IS NOT NULL AND r.other_info LIKE '%Artificial Analysis ID %'
    AND (r.benchmark_id !~ '-v4$' OR substring(r.other_info FROM 'Intelligence Index v([0-9]+\.[0-9]+(?:\.[0-9]+)?)') IS DISTINCT FROM '4.3.2')
) THEN RAISE EXCEPTION 'AA bootstrap requires the verified complete v4.3.2 import; reconcile unexpected or mixed methodologies first'; END IF;
IF EXISTS (SELECT 1 FROM public.v2_benchmark_results r
  WHERE r.benchmark_id = 'aa-intelligence-index-v4' AND (r.effective_to IS NULL OR r.effective_to > now())
    AND r.score_numeric IS NOT NULL AND r.other_info LIKE '%Artificial Analysis ID %')
  AND (SELECT count(DISTINCT r.benchmark_id) FROM public.v2_benchmark_results r
    WHERE r.benchmark_id = ANY(ARRAY['aa-intelligence-index-v4','aa-coding-index-v4','aa-agentic-index-v4','aa-intelligence-index-cost-v4'])
      AND (r.effective_to IS NULL OR r.effective_to > now())
      AND r.score_numeric IS NOT NULL AND r.other_info LIKE '%Artificial Analysis ID %') <> 4
THEN RAISE EXCEPTION 'AA bootstrap requires all four metrics from the verified complete v4.3.2 import'; END IF;
WITH imported AS MATERIALIZED (
  SELECT r.*, substring(r.benchmark_id FROM '-v([1-9][0-9]*)$')::integer AS major,
    substring(r.other_info FROM 'Intelligence Index v([0-9]+\.[0-9]+(?:\.[0-9]+)?)') AS methodology
  FROM public.v2_benchmark_results r
  WHERE r.benchmark_id ~ '^aa-(intelligence|coding|agentic)-index(-cost)?-v[1-9][0-9]*$'
    AND (r.effective_to IS NULL OR r.effective_to > now())
    AND r.score_numeric IS NOT NULL
    AND r.score_numeric NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    AND r.other_info LIKE '%Artificial Analysis ID %'
), methods AS (
  SELECT DISTINCT 4 AS major, '4.3.2'::text AS methodology
  FROM imported
  WHERE benchmark_id = 'aa-intelligence-index-v4' AND methodology = '4.3.2'
), initial AS (
  SELECT gen_random_uuid() AS snapshot_id, m.major, m.methodology,
    coalesce(max(r.updated_at), now()) AS fetched_at,
    jsonb_agg(to_jsonb(r) - 'major' - 'methodology' ORDER BY r.result_id) AS results
  FROM methods m JOIN imported r ON r.major = m.major AND r.methodology = m.methodology
  WHERE NOT EXISTS (SELECT 1 FROM public.artificial_analysis_snapshots s WHERE s.major_version = m.major)
  GROUP BY m.major, m.methodology
)
INSERT INTO public.artificial_analysis_snapshots(snapshot_id, major_version, methodology_version, fetched_at, payload)
SELECT snapshot_id, major, methodology, fetched_at,
  jsonb_build_object('snapshot_id', snapshot_id, 'major_version', major,
    'methodology_version', methodology, 'fetched_at', fetched_at,
    'origin', 'existing_catalogue_bootstrap', 'results', results,
    'benchmarks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.benchmark_id) FROM public.v2_benchmarks b
      WHERE b.benchmark_id = ANY(ARRAY['aa-intelligence-index-v' || major, 'aa-coding-index-v' || major,
        'aa-agentic-index-v' || major, 'aa-intelligence-index-cost-v' || major])))
FROM initial;
END;
$bootstrap$;
