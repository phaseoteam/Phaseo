CREATE TABLE "public"."model_discovery_runs" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "trigger"              text                     NOT NULL,
  "source"               text                     NOT NULL,
  "scheduled_at"         timestamp with time zone,
  "status"               text                     NOT NULL DEFAULT 'running'::text,
  "started_at"           timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "finished_at"          timestamp with time zone,
  "providers_total"      integer                  NOT NULL DEFAULT 0,
  "providers_success"    integer                  NOT NULL DEFAULT 0,
  "providers_skipped"    integer                  NOT NULL DEFAULT 0,
  "providers_error"      integer                  NOT NULL DEFAULT 0,
  "changes_count"        integer                  NOT NULL DEFAULT 0,
  "stale_models_deleted" integer                  NOT NULL DEFAULT 0,
  "summary"              jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "error"                text,
  CONSTRAINT "model_discovery_runs_changes_count_check" CHECK ((changes_count >= 0)),
  CONSTRAINT "model_discovery_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "model_discovery_runs_providers_error_check" CHECK ((providers_error >= 0)),
  CONSTRAINT "model_discovery_runs_providers_skipped_check" CHECK ((providers_skipped >= 0)),
  CONSTRAINT "model_discovery_runs_providers_success_check" CHECK ((providers_success >= 0)),
  CONSTRAINT "model_discovery_runs_providers_total_check" CHECK ((providers_total >= 0)),
  CONSTRAINT "model_discovery_runs_stale_models_deleted_check" CHECK ((stale_models_deleted >= 0)),
  CONSTRAINT "model_discovery_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text]))),
  CONSTRAINT "model_discovery_runs_trigger_check" CHECK ((trigger = ANY (ARRAY['scheduled'::text, 'manual'::text])))
);

ALTER TABLE "public"."model_discovery_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_runs_started_at_idx ON public.model_discovery_runs USING btree (started_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."model_discovery_runs"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."model_discovery_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_runs" FROM "anon", "authenticated";
