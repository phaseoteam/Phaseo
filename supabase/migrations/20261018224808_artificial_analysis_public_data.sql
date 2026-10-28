SET local check_function_bodies = off;

CREATE TABLE "public"."artificial_analysis_public_snapshots" (
  "snapshot_id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "major_version"       integer                  NOT NULL,
  "methodology_version" text                     NOT NULL,
  "fetched_at"          timestamp with time zone NOT NULL,
  "published_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "content_hash"        text                     NOT NULL,
  "payload"             jsonb                    NOT NULL,
  CONSTRAINT "artificial_analysis_public_snapshots_check" CHECK (((split_part(methodology_version, '.'::text, 1))::integer = major_version)),
  CONSTRAINT "artificial_analysis_public_snapshots_content_hash_check" CHECK ((content_hash ~ '^[a-f0-9]{64}$'::text)),
  CONSTRAINT "artificial_analysis_public_snapshots_content_hash_key" UNIQUE (content_hash),
  CONSTRAINT "artificial_analysis_public_snapshots_major_version_check" CHECK ((major_version > 0)),
  CONSTRAINT "artificial_analysis_public_snapshots_methodology_version_check" CHECK ((methodology_version ~ '^[1-9][0-9]*\.[0-9]+(\.[0-9]+)?$'::text)),
  CONSTRAINT "artificial_analysis_public_snapshots_payload_check" CHECK ((jsonb_typeof(payload) = 'object'::text)),
  CONSTRAINT "artificial_analysis_public_snapshots_pkey" PRIMARY KEY (snapshot_id)
);

ALTER TABLE "public"."artificial_analysis_public_snapshots"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."artificial_analysis_public_snapshots" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_artificial_analysis_public_models (
  p_model_slug text    DEFAULT NULL::text,
  p_major      integer DEFAULT NULL::integer,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
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

REVOKE ALL ON FUNCTION "public"."get_artificial_analysis_public_models"(text, integer, integer, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.publish_artificial_analysis_public_snapshot (
  p_snapshot jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
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

REVOKE ALL ON FUNCTION "public"."publish_artificial_analysis_public_snapshot"(jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE INDEX artificial_analysis_public_snapshots_latest_idx ON public.artificial_analysis_public_snapshots USING btree (major_version DESC, fetched_at DESC);

REVOKE ALL ON FUNCTION "public"."get_artificial_analysis_public_models"(text, integer, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_artificial_analysis_public_models"(text, integer, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_artificial_analysis_public_models"(text, integer, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."publish_artificial_analysis_public_snapshot"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_artificial_analysis_public_snapshot"(jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_artificial_analysis_public_snapshot"(jsonb) TO "service_role";

REVOKE ALL ON TABLE "public"."artificial_analysis_public_snapshots" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."artificial_analysis_public_snapshots" TO "service_role";
