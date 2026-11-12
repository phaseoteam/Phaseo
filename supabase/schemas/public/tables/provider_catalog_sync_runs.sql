CREATE TABLE "public"."provider_catalog_sync_runs" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"      text                     NOT NULL,
  "trigger"            text                     NOT NULL,
  "external_event_id"  text,
  "status"             text                     NOT NULL DEFAULT 'processing'::text,
  "catalog_url"        text,
  "catalog_sha256"     text,
  "model_count"        integer,
  "model_preview"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "validation_summary" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "error_message"      text,
  "started_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at"       timestamp with time zone,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "review_status"      text                     NOT NULL DEFAULT 'pending'::text,
  "review_summary"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "reviewed_by"        uuid,
  "reviewed_at"        timestamp with time zone,
  CONSTRAINT "provider_catalog_sync_runs_model_count_check" CHECK (((model_count IS NULL) OR (model_count >= 0))),
  CONSTRAINT "provider_catalog_sync_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_catalog_sync_runs_review_status_check"
    CHECK ((review_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'approved'::text, 'partially_approved'::text, 'rejected'::text, 'needs_changes'::text]))),
  CONSTRAINT "provider_catalog_sync_runs_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_sync_runs_status_check"
    CHECK ((status = ANY (ARRAY['processing'::text, 'not_modified'::text, 'validated'::text, 'applied'::text, 'rejected'::text, 'failed'::text]))),
  CONSTRAINT "provider_catalog_sync_runs_trigger_check" CHECK ((trigger = ANY (ARRAY['webhook'::text, 'poll'::text, 'manual'::text]))),
  CONSTRAINT "provider_catalog_sync_runs_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_sync_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX provider_catalog_sync_runs_event_idx ON public.provider_catalog_sync_runs USING btree (provider_slug, external_event_id)
  WHERE (external_event_id IS NOT NULL);

CREATE INDEX provider_catalog_sync_runs_provider_idx ON public.provider_catalog_sync_runs USING btree (provider_slug, created_at DESC);

CREATE INDEX provider_catalog_sync_runs_review_idx ON public.provider_catalog_sync_runs USING btree (review_status, created_at DESC);

CREATE INDEX provider_catalog_sync_runs_reviewed_by_idx ON public.provider_catalog_sync_runs USING btree (reviewed_by);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_sync_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_catalog_sync_runs" IS 'Idempotent catalog refresh attempts and validation outcomes.';

REVOKE ALL ON TABLE "public"."provider_catalog_sync_runs" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_sync_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_sync_runs" FROM "anon", "authenticated";
