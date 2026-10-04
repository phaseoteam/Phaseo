CREATE TABLE "public"."v2_provider_regions" (
  "provider_region_id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"            text                     NOT NULL,
  "region_code"              text                     NOT NULL,
  "display_name"             text,
  "execution_supported"      boolean                  NOT NULL DEFAULT true,
  "data_residency_supported" boolean                  NOT NULL DEFAULT false,
  "status"                   text                     NOT NULL DEFAULT 'active'::text,
  "routing_enabled"          boolean                  NOT NULL DEFAULT true,
  "metadata"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_provider_regions_key" UNIQUE (provider_slug, region_code),
  CONSTRAINT "v2_provider_regions_pkey" PRIMARY KEY (provider_region_id),
  CONSTRAINT "v2_provider_regions_region_check" CHECK (((region_code = lower(region_code)) AND (region_code ~ '^[a-z0-9][a-z0-9._-]*$'::text))),
  CONSTRAINT "v2_provider_regions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_provider_regions_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_provider_regions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_provider_regions_lookup_idx ON public.v2_provider_regions USING btree (region_code, status, routing_enabled, provider_slug);

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_provider_regions
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_provider_regions
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_provider_regions"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_providers p
  WHERE (p.provider_slug = v2_provider_regions.provider_slug))));

CREATE POLICY "v2_provider_regions_public_select" ON "public"."v2_provider_regions"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((status <> 'disabled'::text) AND (routing_enabled = true)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_provider_regions" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_provider_regions" IS 'Normalized provider execution/data regions used for display and route eligibility.';
