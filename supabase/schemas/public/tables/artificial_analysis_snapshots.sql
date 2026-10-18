CREATE TABLE public.artificial_analysis_snapshots (
  snapshot_id uuid PRIMARY KEY,
  major_version integer NOT NULL CHECK (major_version > 0),
  methodology_version text NOT NULL CHECK (methodology_version ~ '^[1-9][0-9]*\.[0-9]+(\.[0-9]+)?$'),
  fetched_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT artificial_analysis_snapshot_version CHECK (split_part(methodology_version, '.', 1)::integer = major_version)
);
ALTER TABLE public.artificial_analysis_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX artificial_analysis_snapshots_version_idx ON public.artificial_analysis_snapshots (major_version, fetched_at DESC);
REVOKE ALL ON TABLE public.artificial_analysis_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.artificial_analysis_snapshots TO service_role;
