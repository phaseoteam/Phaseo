CREATE OR REPLACE FUNCTION public.publish_artificial_analysis_snapshot(p_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  snapshot_uuid uuid := (p_snapshot->>'snapshot_id')::uuid;
  major integer := (p_snapshot->>'major_version')::integer;
  fetched timestamptz := (p_snapshot->>'fetched_at')::timestamptz;
  expected_ids text[];
  managed_ids text[];
  previous_payload jsonb;
BEGIN
  -- Serialize publishers; failures roll back the snapshot and compatibility rows together.
  PERFORM pg_advisory_xact_lock(hashtextextended('artificial-analysis-publication', 0));
  SELECT payload INTO previous_payload FROM public.artificial_analysis_snapshots WHERE snapshot_id = snapshot_uuid;
  IF FOUND THEN
    IF previous_payload <> p_snapshot THEN RAISE EXCEPTION 'Snapshot identity reused with different content'; END IF;
    RETURN snapshot_uuid;
  END IF;
  IF snapshot_uuid IS NULL OR major IS NULL OR major < 1 OR fetched IS NULL
    OR fetched > now() + interval '5 minutes'
    OR coalesce(p_snapshot->>'methodology_version', '') !~ ('^' || major || '\.[0-9]+(\.[0-9]+)?$')
    OR jsonb_typeof(p_snapshot->'benchmarks') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'results') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'model_slugs') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'source_owners') IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'Invalid Artificial Analysis snapshot'; END IF;
  IF jsonb_array_length(p_snapshot->'results') = 0 OR jsonb_array_length(p_snapshot->'results') > 20000
    OR jsonb_array_length(p_snapshot->'model_slugs') = 0
  THEN RAISE EXCEPTION 'Empty or oversized Artificial Analysis snapshot'; END IF;
  IF EXISTS (SELECT 1 FROM public.artificial_analysis_snapshots WHERE fetched_at >= fetched OR major_version > major
    OR string_to_array(methodology_version, '.')::integer[] > string_to_array(p_snapshot->>'methodology_version', '.')::integer[])
  THEN RAISE EXCEPTION 'Refusing stale Artificial Analysis snapshot'; END IF;
  expected_ids := ARRAY['aa-intelligence-index-v' || major, 'aa-coding-index-v' || major,
    'aa-agentic-index-v' || major, 'aa-intelligence-index-cost-v' || major];
  managed_ids := expected_ids || ARRAY['aa-intelligence-index', 'aa-coding-index', 'aa-agentic-index', 'aa-intelligence-index-cost'];
  IF jsonb_array_length(p_snapshot->'benchmarks') <> 4
    OR (SELECT count(DISTINCT b->>'benchmark_id') FROM jsonb_array_elements(p_snapshot->'benchmarks') b WHERE b->>'benchmark_id' = ANY(expected_ids)) <> 4
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'results') r
      WHERE coalesce(r->>'benchmark_id', '') <> ALL(expected_ids)
        OR nullif(r->>'result_id', '') IS NULL OR nullif(r->>'model_slug', '') IS NULL
        OR NOT (p_snapshot->'model_slugs' ? (r->>'model_slug'))
        OR nullif(r->>'result_key', '') IS NULL
        OR nullif(r->>'score_numeric', '') IS NULL
        OR (r->>'score_numeric')::numeric IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
        OR r->>'score' IS DISTINCT FROM r->>'score_numeric'
        OR substring(r->>'other_info' FROM 'Intelligence Index v([0-9]+\.[0-9]+(?:\.[0-9]+)?)') IS DISTINCT FROM p_snapshot->>'methodology_version'
        OR nullif(substring(r->>'other_info' FROM 'Artificial Analysis ID ([^;]+)'), '') IS NULL
        OR p_snapshot->'source_owners'->>substring(r->>'other_info' FROM 'Artificial Analysis ID ([^;]+)') IS DISTINCT FROM r->>'model_slug')
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'results') r WHERE r->>'benchmark_id' = expected_ids[1])
  THEN RAISE EXCEPTION 'Snapshot contains invalid results or benchmark definitions'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'results') r
    JOIN public.v2_benchmark_results old ON old.result_id = (r->>'result_id')::uuid
    WHERE old.model_slug IS DISTINCT FROM r->>'model_slug' OR old.benchmark_id IS DISTINCT FROM r->>'benchmark_id'
      OR old.result_key IS DISTINCT FROM r->>'result_key')
  THEN RAISE EXCEPTION 'Snapshot result identity conflicts with existing catalogue'; END IF;

  INSERT INTO public.artificial_analysis_snapshots(snapshot_id, major_version, methodology_version, fetched_at, payload)
  VALUES(snapshot_uuid, major, p_snapshot->>'methodology_version', fetched, p_snapshot);
  INSERT INTO public.v2_benchmarks(benchmark_id, name, category, ascending_order, benchmark_type, link, total_models, updated_at)
  SELECT b.benchmark_id, b.name, b.category, b.ascending_order, b.benchmark_type, b.link, b.total_models, fetched
  FROM jsonb_to_recordset(p_snapshot->'benchmarks') AS b(benchmark_id text, name text, category text,
    ascending_order boolean, benchmark_type text, link text, total_models integer)
  ON CONFLICT (benchmark_id) DO UPDATE SET name = excluded.name, category = excluded.category,
    ascending_order = excluded.ascending_order, benchmark_type = excluded.benchmark_type,
    link = excluded.link, total_models = excluded.total_models, updated_at = excluded.updated_at;
  INSERT INTO public.v2_benchmark_results(result_id, model_slug, benchmark_id, score, score_numeric,
    is_self_reported, other_info, source_link, rank, occur_idx, variant, result_key, effective_to, updated_at)
  SELECT r.result_id, r.model_slug, r.benchmark_id, r.score, r.score_numeric, false,
    r.other_info, r.source_link, r.rank, r.occur_idx, r.variant, r.result_key, NULL, fetched
  FROM jsonb_to_recordset(p_snapshot->'results') AS r(result_id uuid, model_slug text, benchmark_id text,
    score text, score_numeric numeric, other_info text, source_link text, rank integer, occur_idx integer,
    variant text, result_key text)
  ON CONFLICT (result_id) DO UPDATE SET score = excluded.score, score_numeric = excluded.score_numeric,
    other_info = excluded.other_info, source_link = excluded.source_link, rank = excluded.rank,
    occur_idx = excluded.occur_idx, variant = excluded.variant, effective_to = NULL, updated_at = excluded.updated_at;
  -- Preserve unmatched models and earlier major versions. Retire only matched
  -- replacements and configurations whose source owner has moved to another model.
  UPDATE public.v2_benchmark_results old SET effective_to = fetched, updated_at = fetched
  WHERE old.effective_to IS NULL AND old.benchmark_id = ANY(managed_ids)
    AND (p_snapshot->'model_slugs' ? old.model_slug
      OR (p_snapshot->'source_owners' ? substring(old.other_info FROM 'Artificial Analysis ID ([^;]+)')
        AND p_snapshot->'source_owners'->>substring(old.other_info FROM 'Artificial Analysis ID ([^;]+)') <> old.model_slug))
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'results') r WHERE (r->>'result_id')::uuid = old.result_id);
  RETURN snapshot_uuid;
END;
$function$;
REVOKE ALL ON FUNCTION public.publish_artificial_analysis_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_artificial_analysis_snapshot(jsonb) TO service_role, postgres;
