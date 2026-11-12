CREATE TABLE "private"."byok_metadata_retention_runs" (
  "run_id"                     bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "ran_at"                     timestamp with time zone NOT NULL DEFAULT now(),
  "mode"                       text                     NOT NULL,
  "cutoff"                     timestamp with time zone NOT NULL,
  "eligible_requests"          integer                  NOT NULL,
  "oldest_eligible_at"         timestamp with time zone,
  "facts_redacted"             integer                  NOT NULL DEFAULT 0,
  "attempts_redacted"          integer                  NOT NULL DEFAULT 0,
  "routing_traces_redacted"    integer                  NOT NULL DEFAULT 0,
  "gateway_requests_redacted"  integer                  NOT NULL DEFAULT 0,
  "upstream_attempts_redacted" integer                  NOT NULL DEFAULT 0,
  "archive_prefixes_queued"    integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "byok_metadata_retention_runs_mode_check" CHECK ((mode = ANY (ARRAY['report'::text, 'apply'::text]))),
  CONSTRAINT "byok_metadata_retention_runs_pkey" PRIMARY KEY (run_id)
);

ALTER TABLE "private"."byok_metadata_retention_runs"
  ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE "private"."byok_metadata_retention_runs" IS 'One row per BYOK metadata retention run that found eligible requests; counts only, no request data.';
