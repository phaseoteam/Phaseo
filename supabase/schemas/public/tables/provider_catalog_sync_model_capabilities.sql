CREATE TABLE "public"."provider_catalog_sync_model_capabilities" (
  "run_id"        uuid                     NOT NULL,
  "model_slug"    text                     NOT NULL,
  "capability_id" text                     NOT NULL,
  "parameters"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_sync_model_capabilities_pkey" PRIMARY KEY (run_id, model_slug, capability_id),
  CONSTRAINT "provider_catalog_sync_model_capabilities_run_id_model_slug_fkey" FOREIGN KEY (run_id, model_slug) REFERENCES public.provider_catalog_sync_models(run_id, model_slug)
    ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_sync_model_capabilities"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_sync_model_capabilities"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."provider_catalog_sync_model_capabilities" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_sync_model_capabilities" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_sync_model_capabilities" FROM "anon", "authenticated";
