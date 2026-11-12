CREATE OR REPLACE FUNCTION public.publish_artificial_analysis_public_snapshot(p_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  saved_id uuid;
  fetched timestamptz := (p_snapshot->>'fetchedAt')::timestamptz;
  version text := p_snapshot->'methodologyVersions'->>0;
  snapshot_hash text := p_snapshot->>'contentHash';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('artificial-analysis-public-data', 0));
  IF p_snapshot->>'coverage' IS DISTINCT FROM 'full_frontend_dataset'
    OR p_snapshot->>'sourceUrl' IS DISTINCT FROM 'https://artificialanalysis.ai/models'
    OR coalesce(p_snapshot->>'dataUrl', '') !~ '^https://artificialanalysis\.ai/data/[a-f0-9]+\.txt$'
    OR coalesce(snapshot_hash, '') !~ '^[a-f0-9]{64}$'
    OR coalesce(version, '') !~ '^[1-9][0-9]*\.[0-9]+(\.[0-9]+)?$'
    OR jsonb_array_length(p_snapshot->'methodologyVersions') IS DISTINCT FROM 1
    OR fetched IS NULL OR fetched > now() + interval '5 minutes'
    OR jsonb_typeof(p_snapshot->'models') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot->'matching'->'sources') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid full Artificial Analysis public snapshot'; END IF;
  IF jsonb_array_length(p_snapshot->'models') NOT BETWEEN 1 AND 10000
    OR jsonb_array_length(p_snapshot->'matching'->'sources') <> jsonb_array_length(p_snapshot->'models')
    OR pg_column_size(p_snapshot) > 50000000
  THEN RAISE EXCEPTION 'Empty, incomplete or oversized public snapshot'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'models') m
    WHERE coalesce(m->>'id', '') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      OR coalesce(m->>'slug', '') !~ '^[a-zA-Z0-9._-]+$'
      OR coalesce(m->>'name', '') = ''
      OR jsonb_typeof(m->'sourceData') IS DISTINCT FROM 'object'
  ) OR (SELECT count(DISTINCT m->>'id') FROM jsonb_array_elements(p_snapshot->'models') m) <> jsonb_array_length(p_snapshot->'models')
  THEN RAISE EXCEPTION 'Invalid or duplicate source identities'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'matching'->'sources') owner
    LEFT JOIN public.v2_models model ON model.model_slug = owner->>'model_id'
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->'models') m WHERE m->>'id' = owner->>'id')
      OR (owner->>'model_id' IS NOT NULL AND model.model_slug IS NULL)
  ) OR (SELECT count(DISTINCT owner->>'id') FROM jsonb_array_elements(p_snapshot->'matching'->'sources') owner) <> jsonb_array_length(p_snapshot->'models')
  THEN RAISE EXCEPTION 'Invalid source ownership'; END IF;
  SELECT snapshot_id INTO saved_id FROM public.artificial_analysis_public_snapshots s WHERE s.content_hash = snapshot_hash;
  IF FOUND THEN
    IF (SELECT payload - 'fetchedAt' - 'extractedAt' - 'contentHash' - 'matching' - 'pageSha256' FROM public.artificial_analysis_public_snapshots WHERE snapshot_id = saved_id)
      IS DISTINCT FROM (p_snapshot - 'fetchedAt' - 'extractedAt' - 'contentHash' - 'matching' - 'pageSha256')
      OR (SELECT payload->'matching'->'sources' FROM public.artificial_analysis_public_snapshots WHERE snapshot_id = saved_id) IS DISTINCT FROM p_snapshot->'matching'->'sources'
    THEN RAISE EXCEPTION 'Public snapshot hash reused with different content'; END IF;
    RETURN saved_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.artificial_analysis_public_snapshots s WHERE s.fetched_at >= fetched
    OR string_to_array(s.methodology_version, '.')::integer[] > string_to_array(version, '.')::integer[])
  THEN RAISE EXCEPTION 'Stale public snapshot or methodology downgrade'; END IF;
  INSERT INTO public.artificial_analysis_public_snapshots (major_version, methodology_version, fetched_at, content_hash, payload)
  VALUES (split_part(version, '.', 1)::integer, version, fetched, snapshot_hash, p_snapshot)
  RETURNING snapshot_id INTO saved_id;
  RETURN saved_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.publish_artificial_analysis_public_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_artificial_analysis_public_snapshot(jsonb) TO service_role;
