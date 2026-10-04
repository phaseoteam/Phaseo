CREATE TABLE "public"."v2_pricing_skus" (
  "sku_id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_model_id" text                     NOT NULL,
  "sku_code"          text                     NOT NULL,
  "version"           integer                  NOT NULL DEFAULT 1,
  "operation"         text                     NOT NULL DEFAULT 'inference'::text,
  "status"            text                     NOT NULL DEFAULT 'active'::text,
  "region"            text,
  "display_name"      text                     NOT NULL,
  "description"       text,
  "currency"          text                     NOT NULL DEFAULT 'USD'::text,
  "effective_from"    timestamp with time zone NOT NULL DEFAULT now(),
  "effective_to"      timestamp with time zone,
  "metadata"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "service_tier_slug" text,
  "route_variant_id"  uuid,
  CONSTRAINT "v2_pricing_skus_code_check" CHECK (((sku_code = lower(sku_code)) AND (sku_code ~ '^[a-z0-9][a-z0-9._:-]*$'::text))),
  CONSTRAINT "v2_pricing_skus_key" UNIQUE (provider_model_id, sku_code, VERSION),
  CONSTRAINT "v2_pricing_skus_pkey" PRIMARY KEY (sku_id),
  CONSTRAINT "v2_pricing_skus_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_pricing_skus_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_pricing_skus_version_check" CHECK ((version > 0)),
  CONSTRAINT "v2_pricing_skus_window_check" CHECK (((effective_to IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "v2_pricing_skus_route_variant_fkey" FOREIGN KEY (route_variant_id) REFERENCES public.v2_route_variants(variant_id) ON DELETE SET NULL,
  CONSTRAINT "v2_pricing_skus_service_tier_fkey" FOREIGN KEY (service_tier_slug) REFERENCES public.v2_service_tiers(service_tier_slug) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_pricing_skus"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_pricing_skus_active_idx ON public.v2_pricing_skus USING btree (provider_model_id, operation, region)
  WHERE (status = 'active'::text);

CREATE INDEX v2_pricing_skus_route_idx ON public.v2_pricing_skus USING btree (provider_model_id, status, effective_from DESC);

CREATE INDEX v2_pricing_skus_route_variant_id_idx ON public.v2_pricing_skus USING btree (route_variant_id)
  WHERE (route_variant_id IS NOT NULL);

CREATE INDEX v2_pricing_skus_service_tier_slug_idx ON public.v2_pricing_skus USING btree (service_tier_slug)
  WHERE (service_tier_slug IS NOT NULL);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_pricing_skus
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_pricing_skus
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER guard_conditional_provider_catalog_pricing
  BEFORE INSERT ON public.v2_pricing_skus
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_conditional_provider_catalog_pricing();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_pricing_skus
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_pricing_skus"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.v2_model_provider_routes r
  WHERE (r.provider_model_id = v2_pricing_skus.provider_model_id))) AND ((route_variant_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.v2_route_variants v
  WHERE (v.variant_id = v2_pricing_skus.route_variant_id))))));

CREATE POLICY "v2_pricing_skus_public_select" ON "public"."v2_pricing_skus"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((status <> 'disabled'::text) AND (effective_from <= now()) AND ((effective_to IS NULL) OR (effective_to > now()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_pricing_skus" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_pricing_skus" IS 'Versioned billable SKU attached to exactly one v2 provider/model route.';
