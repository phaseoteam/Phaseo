CREATE TABLE "public"."gateway_io_logs" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"            uuid                     NOT NULL,
  "request_id"              text                     NOT NULL,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "io_log_status"           text                     NOT NULL DEFAULT 'not_enabled'::text,
  "io_log_storage_provider" text,
  "io_log_bucket"           text,
  "io_log_object_key"       text,
  "io_log_bytes"            bigint,
  "io_log_sha256"           text,
  "io_log_content_type"     text,
  "io_log_retention_until"  timestamp with time zone,
  "io_log_error"            text,
  CONSTRAINT "gateway_io_logs_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_io_logs_status_check"
    CHECK ((io_log_status = ANY (ARRAY['not_enabled'::text, 'stored'::text, 'missing_bucket'::text, 'too_large'::text, 'error'::text, 'deleted'::text]))),
  CONSTRAINT "gateway_io_logs_workspace_request_key" UNIQUE (workspace_id, request_id),
  CONSTRAINT "gateway_io_logs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_io_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_io_logs_expiry_idx ON public.gateway_io_logs USING btree (io_log_retention_until)
  WHERE ((io_log_status = 'stored'::text) AND (io_log_object_key IS NOT NULL) AND (io_log_retention_until IS NOT NULL));

CREATE INDEX gateway_io_logs_object_key_idx ON public.gateway_io_logs USING btree (io_log_object_key)
  WHERE (io_log_object_key IS NOT NULL);

CREATE INDEX gateway_io_logs_workspace_created_idx ON public.gateway_io_logs USING btree (workspace_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."gateway_io_logs"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_io_logs" TO "service_role";

COMMENT ON TABLE "public"."gateway_io_logs" IS 'Private R2 I/O log metadata keyed by workspace and gateway request. Raw payloads remain in R2.';

REVOKE ALL ON TABLE "public"."gateway_io_logs" FROM "anon", "authenticated";
