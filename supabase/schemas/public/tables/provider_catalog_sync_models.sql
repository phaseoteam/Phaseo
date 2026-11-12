CREATE TABLE "public"."provider_catalog_sync_models" (
  "run_id"                  uuid                     NOT NULL,
  "provider_slug"           text                     NOT NULL,
  "model_slug"              text                     NOT NULL,
  "provider_model_slug"     text                     NOT NULL,
  "name"                    text                     NOT NULL,
  "description"             text,
  "input_modalities"        text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "context_length"          integer,
  "max_output_tokens"       integer,
  "decision"                text                     NOT NULL DEFAULT 'pending'::text,
  "decision_reason"         text,
  "reviewed_by"             uuid,
  "reviewed_at"             timestamp with time zone,
  "metadata"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "canonical_model_slug"    text,
  "match_type"              text,
  "availability"            text                     NOT NULL DEFAULT 'ready'::text,
  "available_from"          timestamp with time zone,
  "deprecated_at"           timestamp with time zone,
  "shutdown_at"             timestamp with time zone,
  "route_projection_status" text                     NOT NULL DEFAULT 'not_projected'::text,
  "route_projection_error"  text,
  CONSTRAINT "provider_catalog_sync_models_availability_check"
    CHECK ((availability = ANY (ARRAY['ready'::text, 'not_ready'::text, 'degraded'::text, 'deprecated'::text, 'retired'::text]))),
  CONSTRAINT "provider_catalog_sync_models_context_check" CHECK (((context_length IS NULL) OR (context_length > 0))),
  CONSTRAINT "provider_catalog_sync_models_decision_check" CHECK ((decision = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'needs_changes'::text]))),
  CONSTRAINT "provider_catalog_sync_models_match_type_check" CHECK (((match_type IS NULL) OR (match_type = ANY (ARRAY['exact'::text, 'alias'::text, 'new_model'::text])))),
  CONSTRAINT "provider_catalog_sync_models_output_check" CHECK (((max_output_tokens IS NULL) OR (max_output_tokens > 0))),
  CONSTRAINT "provider_catalog_sync_models_pkey" PRIMARY KEY (run_id, model_slug),
  CONSTRAINT "provider_catalog_sync_models_reason_check"
    CHECK (((decision = ANY (ARRAY['pending'::text, 'approved'::text])) OR (NULLIF(TRIM(BOTH FROM decision_reason), ''::text) IS NOT NULL))),
  CONSTRAINT "provider_catalog_sync_models_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_sync_models_route_projection_check"
    CHECK ((route_projection_status = ANY (ARRAY['not_projected'::text, 'staged'::text, 'probe_passed'::text, 'enabled'::text, 'failed'::text]))),
  CONSTRAINT "provider_catalog_sync_models_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_sync_models_canonical_model_slug_fkey" FOREIGN KEY (canonical_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_sync_models_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_sync_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_sync_models_canonical_model_slug_idx ON public.provider_catalog_sync_models USING btree (canonical_model_slug);

CREATE INDEX provider_catalog_sync_models_review_idx ON public.provider_catalog_sync_models USING btree (provider_slug, decision, created_at DESC);

CREATE INDEX provider_catalog_sync_models_reviewed_by_idx ON public.provider_catalog_sync_models USING btree (reviewed_by);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_sync_models"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."provider_catalog_sync_models"."route_projection_status" IS 'Approved claims are staged as disabled routes; only a successful endpoint probe may enable routing.';

COMMENT ON TABLE "public"."provider_catalog_sync_models" IS 'Immutable per-refresh provider/model claims awaiting reviewer decisions.';

REVOKE ALL ON TABLE "public"."provider_catalog_sync_models" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_sync_models" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_sync_models" FROM "anon", "authenticated";
