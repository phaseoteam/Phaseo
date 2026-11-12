CREATE TABLE "public"."provider_catalog_model_capabilities" (
  "provider_slug" text                     NOT NULL,
  "model_slug"    text                     NOT NULL,
  "capability_id" text                     NOT NULL,
  "parameters"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"        text                     NOT NULL DEFAULT 'active'::text,
  "source_run_id" uuid,
  "observed_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_model_capabilities_pkey" PRIMARY KEY (provider_slug, model_slug, capability_id),
  CONSTRAINT "provider_catalog_model_capabilities_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text]))),
  CONSTRAINT "provider_catalog_model_capabiliti_provider_slug_model_slug_fkey" FOREIGN KEY (provider_slug, model_slug)
    REFERENCES public.provider_catalog_models(provider_slug, model_slug) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_model_capabilities_source_run_id_fkey" FOREIGN KEY (source_run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE SET NULL
);

ALTER TABLE "public"."provider_catalog_model_capabilities"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_model_capabilities_source_run_id_idx ON public.provider_catalog_model_capabilities USING btree (source_run_id);

CREATE INDEX provider_catalog_model_capabilities_status_idx ON public.provider_catalog_model_capabilities USING btree (provider_slug, status, capability_id);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_model_capabilities"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."provider_catalog_model_capabilities" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_model_capabilities" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_model_capabilities" FROM "anon", "authenticated";
