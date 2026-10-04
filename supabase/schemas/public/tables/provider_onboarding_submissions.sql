CREATE TABLE "public"."provider_onboarding_submissions" (
  "id"                                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"                     text                     NOT NULL,
  "submitted_by"                      uuid                     NOT NULL,
  "provider_name"                     text                     NOT NULL,
  "website_url"                       text                     NOT NULL,
  "logo_url"                          text,
  "catalog_url"                       text,
  "status"                            text                     NOT NULL DEFAULT 'submitted'::text,
  "model_count"                       integer                  NOT NULL DEFAULT 0,
  "catalog_sha256"                    text,
  "catalog_preview"                   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "validation_summary"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "submitted_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"                        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                        timestamp with time zone NOT NULL DEFAULT now(),
  "application_type"                  text                     NOT NULL DEFAULT 'new'::text,
  "catalog_mode"                      text                     NOT NULL DEFAULT 'remote'::text,
  "provider_review_status"            text                     NOT NULL DEFAULT 'awaiting_approval'::text,
  "provider_review_reason"            text,
  "provider_reviewed_by"              uuid,
  "provider_reviewed_at"              timestamp with time zone,
  "pending_webhook_secret_ciphertext" text,
  "pending_webhook_secret_iv"         text,
  "pending_webhook_secret_hash"       text,
  CONSTRAINT "provider_onboarding_submissions_application_type_check" CHECK ((application_type = ANY (ARRAY['new'::text, 'claim'::text]))),
  CONSTRAINT "provider_onboarding_submissions_catalog_mode_check" CHECK ((catalog_mode = ANY (ARRAY['remote'::text, 'managed'::text]))),
  CONSTRAINT "provider_onboarding_submissions_model_count_check" CHECK ((model_count >= 0)),
  CONSTRAINT "provider_onboarding_submissions_pending_webhook_secret_check"
    CHECK
    ((((pending_webhook_secret_ciphertext IS NULL) AND (pending_webhook_secret_iv IS NULL) AND (pending_webhook_secret_hash IS NULL)) OR ((pending_webhook_secret_ciphertext IS
    NOT NULL) AND (pending_webhook_secret_iv IS NOT NULL) AND (pending_webhook_secret_hash IS NOT NULL)))),
  CONSTRAINT "provider_onboarding_submissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_onboarding_submissions_provider_review_status_check"
    CHECK ((provider_review_status = ANY (ARRAY['awaiting_approval'::text, 'approved'::text, 'paused'::text, 'rejected'::text, 'needs_changes'::text]))),
  CONSTRAINT "provider_onboarding_submissions_provider_reviewed_by_fkey" FOREIGN KEY (provider_reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_onboarding_submissions_provider_slug_check" CHECK (((provider_slug = lower(provider_slug)) AND (provider_slug ~ '^[a-z0-9][a-z0-9._-]*$'::text))),
  CONSTRAINT "provider_onboarding_submissions_status_check"
    CHECK ((status = ANY (ARRAY['submitted'::text, 'needs_action'::text, 'staging'::text, 'published'::text, 'rejected'::text, 'withdrawn'::text]))),
  CONSTRAINT "provider_onboarding_submissions_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_onboarding_submissions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_onboarding_submissions_latest_idx ON public.provider_onboarding_submissions USING btree (provider_slug, created_at DESC, id DESC);

CREATE INDEX provider_onboarding_submissions_provider_idx ON public.provider_onboarding_submissions USING btree (provider_slug, created_at DESC);

CREATE INDEX provider_onboarding_submissions_review_queue_idx ON public.provider_onboarding_submissions USING btree (provider_review_status, created_at DESC);

CREATE INDEX provider_onboarding_submissions_submitter_idx ON public.provider_onboarding_submissions USING btree (submitted_by, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_onboarding_submissions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_onboarding_submissions" IS 'Versioned self-serve provider catalog submissions. Submission state never implies route enablement.';

REVOKE ALL ON TABLE "public"."provider_onboarding_submissions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_onboarding_submissions" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_onboarding_submissions" FROM "anon", "authenticated";
