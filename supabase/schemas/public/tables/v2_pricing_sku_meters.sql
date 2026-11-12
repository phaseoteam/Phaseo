CREATE TABLE "public"."v2_pricing_sku_meters" (
  "sku_meter_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sku_id"        uuid                     NOT NULL,
  "meter_key"     text                     NOT NULL,
  "modality"      text                     NOT NULL,
  "direction"     text,
  "unit"          text                     NOT NULL,
  "unit_quantity" numeric(30,12)           NOT NULL DEFAULT 1,
  "price_nanos"   numeric(30,12)           NOT NULL,
  "display_label" text                     NOT NULL,
  "display_unit"  text                     NOT NULL,
  "billable"      boolean                  NOT NULL DEFAULT true,
  "meter_order"   integer                  NOT NULL DEFAULT 100,
  "metadata"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_pricing_sku_meters_key_check" CHECK (((meter_key = lower(meter_key)) AND (meter_key ~ '^[a-z0-9][a-z0-9._:-]*$'::text))),
  CONSTRAINT "v2_pricing_sku_meters_key" UNIQUE (sku_id, meter_key),
  CONSTRAINT "v2_pricing_sku_meters_meter_key_fkey" FOREIGN KEY (meter_key) REFERENCES public.v2_meter_definitions(meter_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "v2_pricing_sku_meters_order_check" CHECK ((meter_order >= 0)),
  CONSTRAINT "v2_pricing_sku_meters_pkey" PRIMARY KEY (sku_meter_id),
  CONSTRAINT "v2_pricing_sku_meters_price_check" CHECK ((price_nanos >= (0)::numeric)),
  CONSTRAINT "v2_pricing_sku_meters_unit_quantity_check" CHECK ((unit_quantity > (0)::numeric)),
  CONSTRAINT "v2_pricing_sku_meters_sku_id_fkey" FOREIGN KEY (sku_id) REFERENCES public.v2_pricing_skus(sku_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_pricing_sku_meters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_pricing_sku_meters_lookup_idx ON public.v2_pricing_sku_meters USING btree (meter_key, modality, direction);

CREATE INDEX v2_pricing_sku_meters_sku_idx ON public.v2_pricing_sku_meters USING btree (sku_id, meter_order, meter_key);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_pricing_sku_meters
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_pricing_sku_meters
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_pricing_sku_meters
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_pricing_sku_meters"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_pricing_skus s
  WHERE (s.sku_id = v2_pricing_sku_meters.sku_id))));

CREATE POLICY "v2_pricing_sku_meters_public_select" ON "public"."v2_pricing_sku_meters"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_pricing_skus sku
  WHERE
    ((sku.sku_id = v2_pricing_sku_meters.sku_id) AND (sku.status <> 'disabled'::text) AND (sku.effective_from <= now()) AND ((sku.effective_to IS NULL) OR (sku.effective_to >
    now()))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_pricing_sku_meters" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_pricing_sku_meters"."meter_key" IS 'Stable machine key used by request usage facts and rollups, for example input_tokens or video_seconds.';

COMMENT ON TABLE "public"."v2_pricing_sku_meters" IS 'Per-offer price rates. One SKU may contain multiple rates referencing canonical v2_meter_definitions.';
