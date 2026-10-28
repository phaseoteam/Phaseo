CREATE TABLE public.artificial_analysis_public_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  major_version integer NOT NULL CHECK (major_version > 0),
  methodology_version text NOT NULL CHECK (methodology_version ~ '^[1-9][0-9]*\.[0-9]+(\.[0-9]+)?$'),
  fetched_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (split_part(methodology_version, '.', 1)::integer = major_version)
);
ALTER TABLE public.artificial_analysis_public_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX artificial_analysis_public_snapshots_latest_idx ON public.artificial_analysis_public_snapshots (major_version DESC, fetched_at DESC);
REVOKE ALL ON TABLE public.artificial_analysis_public_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.artificial_analysis_public_snapshots TO service_role;
