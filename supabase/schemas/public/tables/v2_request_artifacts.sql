CREATE TABLE "public"."v2_request_artifacts" (
  "artifact_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_event_id" uuid                     NOT NULL,
  "attempt_id"       uuid,
  "artifact_kind"    text                     NOT NULL,
  "r2_key"           text                     NOT NULL,
  "sha256"           text,
  "byte_size"        bigint,
  "content_type"     text,
  "redacted"         boolean                  NOT NULL DEFAULT true,
  "retention_until"  timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_request_artifacts_key_check" CHECK (((length(TRIM(BOTH FROM r2_key)) > 0) AND (r2_key !~* '^https?://'::text))),
  CONSTRAINT "v2_request_artifacts_kind_check"
    CHECK ((artifact_kind = ANY (ARRAY['request_body'::text, 'response_body'::text, 'upstream_request'::text, 'upstream_response'::text, 'tool_io'::text]))),
  CONSTRAINT "v2_request_artifacts_pkey" PRIMARY KEY (artifact_id),
  CONSTRAINT "v2_request_artifacts_sha_check" CHECK (((sha256 IS NULL) OR (sha256 ~ '^[a-f0-9]{64}$'::text))),
  CONSTRAINT "v2_request_artifacts_size_check" CHECK (((byte_size IS NULL) OR (byte_size >= 0))),
  CONSTRAINT "v2_request_artifacts_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES public.v2_request_attempts(attempt_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_artifacts_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_request_artifacts"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_request_artifacts_attempt_kind_key ON public.v2_request_artifacts USING btree (attempt_id, artifact_kind)
  WHERE (attempt_id IS NOT NULL);

CREATE INDEX v2_request_artifacts_request_idx ON public.v2_request_artifacts USING btree (request_event_id, artifact_kind);

CREATE UNIQUE INDEX v2_request_artifacts_request_kind_key ON public.v2_request_artifacts USING btree (request_event_id, artifact_kind)
  WHERE (attempt_id IS NULL);

CREATE INDEX v2_request_artifacts_retention_idx ON public.v2_request_artifacts USING btree (retention_until)
  WHERE (retention_until IS NOT NULL);

CREATE POLICY "v2_request_artifacts_workspace_select" ON "public"."v2_request_artifacts"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_artifacts.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_artifacts" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_request_artifacts" IS 'R2 object references and retention metadata only; the object body is never stored in Supabase.';
