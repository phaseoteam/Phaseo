CREATE TABLE "public"."provider_catalog_models" (
  "provider_slug"        text                     NOT NULL,
  "model_slug"           text                     NOT NULL,
  "provider_model_slug"  text                     NOT NULL,
  "name"                 text                     NOT NULL,
  "description"          text,
  "input_modalities"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "context_length"       integer,
  "max_output_tokens"    integer,
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "first_seen_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "source_run_id"        uuid,
  "metadata"             jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "canonical_model_slug" text,
  "availability"         text                     NOT NULL DEFAULT 'ready'::text,
  "available_from"       timestamp with time zone,
  "deprecated_at"        timestamp with time zone,
  "shutdown_at"          timestamp with time zone,
  CONSTRAINT "provider_catalog_models_availability_check"
    CHECK ((availability = ANY (ARRAY['ready'::text, 'not_ready'::text, 'degraded'::text, 'deprecated'::text, 'retired'::text]))),
  CONSTRAINT "provider_catalog_models_context_check" CHECK (((context_length IS NULL) OR (context_length > 0))),
  CONSTRAINT "provider_catalog_models_output_check" CHECK (((max_output_tokens IS NULL) OR (max_output_tokens > 0))),
  CONSTRAINT "provider_catalog_models_pkey" PRIMARY KEY (provider_slug, model_slug),
  CONSTRAINT "provider_catalog_models_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text]))),
  CONSTRAINT "provider_catalog_models_source_run_id_fkey" FOREIGN KEY (source_run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_models_canonical_model_slug_fkey" FOREIGN KEY (canonical_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_models_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_models"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_models_canonical_model_slug_idx ON public.provider_catalog_models USING btree (canonical_model_slug);

CREATE INDEX provider_catalog_models_source_run_id_idx ON public.provider_catalog_models USING btree (source_run_id);

CREATE INDEX provider_catalog_models_status_idx ON public.provider_catalog_models USING btree (provider_slug, status, model_slug);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_models"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_catalog_models" IS 'Normalized provider-reported model snapshot; not public route publication.';

REVOKE ALL ON TABLE "public"."provider_catalog_models" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_models" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_models" FROM "anon", "authenticated";
