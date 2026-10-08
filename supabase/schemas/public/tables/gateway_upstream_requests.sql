CREATE TABLE "public"."gateway_upstream_requests" (
  "id"                         uuid                     NOT NULL,
  "created_at"                 timestamp with time zone NOT NULL,
  "gateway_request_id"         uuid                     NOT NULL,
  "gateway_request_created_at" timestamp with time zone NOT NULL,
  "request_id"                 text                     NOT NULL,
  "workspace_id"               uuid                     NOT NULL,
  "app_id"                     uuid,
  "key_id"                     uuid,
  "sequence"                   integer                  NOT NULL,
  "round_number"               integer                  NOT NULL,
  "attempt_number"             integer,
  "internal_attempt_number"    integer,
  "stage"                      text                     NOT NULL,
  "endpoint"                   text                     NOT NULL,
  "model_id"                   text                     NOT NULL,
  "provider"                   text,
  "api_model_id"               text,
  "provider_model_slug"        text,
  "upstream_route"             text,
  "upstream_url"               text,
  "status_code"                integer,
  "status_text"                text,
  "success"                    boolean                  NOT NULL,
  "outcome"                    text                     NOT NULL,
  "retryable"                  boolean,
  "fallback_attempted"         boolean                  NOT NULL,
  "was_probe"                  boolean                  NOT NULL,
  "key_source"                 text,
  "native_response_id"         text,
  "provider_finish_reason"     text,
  "finish_reason"              text,
  "duration_ms"                integer,
  "latency_ms"                 integer,
  "generation_ms"              integer,
  "total_ms"                   integer,
  "request_build_ms"           integer,
  "upstream_headers_ms"        integer,
  "retry_delay_ms"             integer,
  "usage"                      jsonb                    NOT NULL,
  "cost_nanos"                 bigint                   NOT NULL,
  "currency"                   text,
  "error_code"                 text,
  "error_type"                 text,
  "error_message"              text,
  "error_description"          text,
  "error_param"                text,
  "request_payload"            jsonb,
  "response_payload"           jsonb,
  "metadata"                   jsonb                    NOT NULL
) PARTITION BY RANGE (created_at);

ALTER TABLE "public"."gateway_upstream_requests"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "cost_nanos" SET DEFAULT 0;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "fallback_attempted" SET DEFAULT false;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "round_number" SET DEFAULT 1;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "stage" SET DEFAULT 'upstream'::text;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "success" SET DEFAULT false;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "usage" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."gateway_upstream_requests"
  ALTER COLUMN "was_probe" SET DEFAULT false;

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL;

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_attempt_ck" CHECK (((attempt_number IS NULL) OR (attempt_number > 0)));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_gateway_request_fkey" FOREIGN KEY (gateway_request_id, gateway_request_created_at) REFERENCES public.gateway_requests(id, created_at)
    ON DELETE CASCADE;

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_internal_attempt_ck" CHECK (((internal_attempt_number IS NULL) OR (internal_attempt_number > 0)));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_key_source_ck" CHECK (((key_source IS NULL) OR (key_source = ANY (ARRAY['gateway'::text, 'byok'::text]))));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_parent_sequence_key" UNIQUE (gateway_request_id, gateway_request_created_at, SEQUENCE, created_at);

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_round_ck" CHECK ((round_number > 0));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_sequence_ck" CHECK ((sequence > 0));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_stage_ck" CHECK ((stage = ANY (ARRAY['routing'::text, 'upstream'::text])));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_status_ck" CHECK (((status_code IS NULL) OR ((status_code >= 100) AND (status_code <= 599))));

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL;

ALTER TABLE "public"."gateway_upstream_requests"
  ADD CONSTRAINT "gateway_upstream_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT;

CREATE INDEX gateway_upstream_requests_app_id_idx ON ONLY public.gateway_upstream_requests USING btree (app_id)
  WHERE (app_id IS NOT NULL);

CREATE INDEX gateway_upstream_requests_key_created_idx ON ONLY public.gateway_upstream_requests USING btree (key_id, created_at DESC)
  WHERE (key_id IS NOT NULL);

CREATE INDEX gateway_upstream_requests_workspace_created_idx ON ONLY public.gateway_upstream_requests USING btree (workspace_id, created_at DESC);

CREATE INDEX gateway_upstream_requests_workspace_provider_created_idx ON ONLY public.gateway_upstream_requests USING btree (workspace_id, PROVIDER, created_at DESC)
  WHERE (PROVIDER IS NOT NULL);

CREATE INDEX gateway_upstream_requests_workspace_request_created_sequence_id ON ONLY public.gateway_upstream_requests
  USING btree (workspace_id, request_id, gateway_request_created_at, SEQUENCE);

CREATE TABLE "public"."gateway_upstream_requests_2026_07" PARTITION OF "public"."gateway_upstream_requests" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

ALTER TABLE "public"."gateway_upstream_requests_2026_07"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_upstream_requests_2026_08" PARTITION OF "public"."gateway_upstream_requests" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

ALTER TABLE "public"."gateway_upstream_requests_2026_08"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_upstream_requests_2026_09" PARTITION OF "public"."gateway_upstream_requests" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

ALTER TABLE "public"."gateway_upstream_requests_2026_09"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_upstream_requests_2026_10" PARTITION OF "public"."gateway_upstream_requests" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

ALTER TABLE "public"."gateway_upstream_requests_2026_10"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_upstream_requests_default" PARTITION OF "public"."gateway_upstream_requests" DEFAULT;

ALTER TABLE "public"."gateway_upstream_requests_default"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gateway_upstream_requests_insert_service" ON "public"."gateway_upstream_requests"
  FOR INSERT
  TO "service_role"
  WITH CHECK (true);

CREATE POLICY "gateway_upstream_requests_select_service" ON "public"."gateway_upstream_requests"
  FOR SELECT
  TO "service_role"
  USING (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_upstream_requests_2026_07"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_upstream_requests_2026_08"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_upstream_requests_2026_09"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "service_role_full_access" ON "public"."gateway_upstream_requests_2026_09"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_upstream_requests_2026_10"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "service_role_full_access" ON "public"."gateway_upstream_requests_default"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_upstream_requests" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_upstream_requests_2026_07" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_upstream_requests_2026_08" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_upstream_requests_2026_09" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_upstream_requests_default" TO "service_role";

COMMENT ON COLUMN "public"."gateway_upstream_requests"."request_payload" IS 'Sanitized upstream request snapshot. Full raw payloads remain in opt-in R2 I/O logs.';

COMMENT ON COLUMN "public"."gateway_upstream_requests"."response_payload" IS 'Sanitized upstream response snapshot. Full raw payloads remain in opt-in R2 I/O logs.';

COMMENT ON TABLE "public"."gateway_upstream_requests" IS 'Ordered provider interactions, retries, fallbacks, and model rounds linked to one complete gateway request.';

REVOKE ALL ON TABLE "public"."gateway_upstream_requests" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_upstream_requests_2026_07" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_upstream_requests_2026_08" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_upstream_requests_2026_09" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_upstream_requests_2026_10" FROM "anon", "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."gateway_upstream_requests_default" FROM "anon", "authenticated";
