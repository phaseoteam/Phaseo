CREATE TABLE "public"."v2_route_variants" (
  "variant_id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_model_id"  text                     NOT NULL,
  "variant_key"        text                     NOT NULL,
  "provider_region_id" uuid,
  "execution_region"   text,
  "data_region"        text,
  "service_tier_slug"  text                     NOT NULL,
  "status"             text                     NOT NULL DEFAULT 'active'::text,
  "routing_enabled"    boolean                  NOT NULL DEFAULT true,
  "endpoint_label"     text,
  "metadata"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_route_variants_key_check" CHECK (((variant_key = lower(variant_key)) AND (variant_key ~ '^[a-z0-9][a-z0-9._:-]*$'::text))),
  CONSTRAINT "v2_route_variants_key" UNIQUE (provider_model_id, variant_key),
  CONSTRAINT "v2_route_variants_pkey" PRIMARY KEY (variant_id),
  CONSTRAINT "v2_route_variants_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_route_variants_provider_region_id_fkey" FOREIGN KEY (provider_region_id) REFERENCES public.v2_provider_regions(provider_region_id) ON DELETE SET NULL,
  CONSTRAINT "v2_route_variants_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'degraded'::text, 'disabled'::text, 'retired'::text]))),
  CONSTRAINT "v2_route_variants_service_tier_slug_fkey" FOREIGN KEY (service_tier_slug) REFERENCES public.v2_service_tiers(service_tier_slug) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_route_variants"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_route_variants_lookup_idx ON public.v2_route_variants USING btree (provider_model_id, service_tier_slug, execution_region, data_region, status, routing_enabled);

CREATE INDEX v2_route_variants_provider_region_id_idx ON public.v2_route_variants USING btree (provider_region_id)
  WHERE (provider_region_id IS NOT NULL);

CREATE UNIQUE INDEX v2_route_variants_provider_variant_idx ON public.v2_route_variants USING btree (provider_model_id, variant_id);

CREATE INDEX v2_route_variants_region_idx ON public.v2_route_variants USING btree (execution_region, data_region, service_tier_slug)
  WHERE ((status = ANY (ARRAY['active'::text, 'degraded'::text])) AND (routing_enabled = true));

CREATE INDEX v2_route_variants_service_tier_slug_idx ON public.v2_route_variants USING btree (service_tier_slug);

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_route_variants
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_route_variants
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_route_variants"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_model_provider_routes r
  WHERE (r.provider_model_id = v2_route_variants.provider_model_id))));

CREATE POLICY "v2_route_variants_public_select" ON "public"."v2_route_variants"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((status <> 'disabled'::text) AND (routing_enabled = true)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_route_variants" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_route_variants" IS 'Concrete provider/model region and service-tier variant. Pricing attaches here when regional or tier-specific.';
