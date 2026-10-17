-- Preserve the currently imported catalogue as the initial publication without
-- rewriting scores or claiming this is a fresh upstream fetch. Empty future
-- benchmark placeholders do not create publications.
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
  SELECT DISTINCT ON (major) major, methodology
  FROM imported
  WHERE benchmark_id = 'aa-intelligence-index-v' || major
    AND methodology IS NOT NULL AND split_part(methodology, '.', 1)::integer = major
  ORDER BY major, string_to_array(methodology, '.')::integer[] DESC
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
