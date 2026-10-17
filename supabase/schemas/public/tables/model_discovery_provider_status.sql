CREATE TABLE "public"."model_discovery_provider_status" (
  "provider_id"          text                     NOT NULL,
  "provider_name"        text                     NOT NULL,
  "status"               text                     NOT NULL,
  "reason"               text,
  "model_count"          integer,
  "duration_ms"          integer,
  "consecutive_failures" integer                  NOT NULL DEFAULT 0,
  "failing_since"        timestamp with time zone,
  "alerted_at"           timestamp with time zone,
  "skip_notice_pending"  boolean                  NOT NULL DEFAULT false,
  "last_checked_at"      timestamp with time zone NOT NULL,
  "last_success_at"      timestamp with time zone,
  "last_run_id"          uuid,
  CONSTRAINT "model_discovery_provider_status_consecutive_failures_check" CHECK ((consecutive_failures >= 0)),
  CONSTRAINT "model_discovery_provider_status_pkey" PRIMARY KEY (provider_id),
  CONSTRAINT "model_discovery_provider_status_status_check" CHECK ((status = ANY (ARRAY['ok'::text, 'skipped'::text, 'error'::text])))
);

ALTER TABLE "public"."model_discovery_provider_status"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."model_discovery_provider_status"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."model_discovery_provider_status" IS 'Latest provider /models check outcome per watched provider, with the current failure streak, whether it was alerted, and whether a no-longer-checked notice still has to be sent. Written by the Cloudflare model watcher on every sweep.';

REVOKE ALL ON TABLE "public"."model_discovery_provider_status" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."model_discovery_provider_status" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_provider_status" FROM "anon", "authenticated";
