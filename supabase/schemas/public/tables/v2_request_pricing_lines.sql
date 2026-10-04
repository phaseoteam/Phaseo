CREATE TABLE "public"."v2_request_pricing_lines" (
  "pricing_line_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_event_id" uuid                     NOT NULL,
  "sku_id"           uuid,
  "sku_meter_id"     uuid,
  "meter_key"        text                     NOT NULL,
  "quantity"         numeric(30,12)           NOT NULL,
  "unit"             text                     NOT NULL,
  "unit_price_nanos" numeric(30,12)           NOT NULL,
  "charged_nanos"    bigint                   NOT NULL DEFAULT 0,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_request_pricing_lines_charge_check" CHECK ((charged_nanos >= 0)),
  CONSTRAINT "v2_request_pricing_lines_pkey" PRIMARY KEY (pricing_line_id),
  CONSTRAINT "v2_request_pricing_lines_quantity_check" CHECK ((quantity >= (0)::numeric)),
  CONSTRAINT "v2_request_pricing_lines_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_pricing_lines_sku_id_fkey" FOREIGN KEY (sku_id) REFERENCES public.v2_pricing_skus(sku_id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_pricing_lines_sku_meter_id_fkey" FOREIGN KEY (sku_meter_id) REFERENCES public.v2_pricing_sku_meters(sku_meter_id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_pricing_lines_unit_price_check" CHECK ((unit_price_nanos >= (0)::numeric))
);

ALTER TABLE "public"."v2_request_pricing_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_request_pricing_lines_request_idx ON public.v2_request_pricing_lines USING btree (request_event_id, meter_key);

CREATE INDEX v2_request_pricing_lines_sku_meter_id_idx ON public.v2_request_pricing_lines USING btree (sku_meter_id)
  WHERE (sku_meter_id IS NOT NULL);

CREATE INDEX v2_request_pricing_lines_sku_time_idx ON public.v2_request_pricing_lines USING btree (sku_id, created_at DESC)
  WHERE (sku_id IS NOT NULL);

CREATE TRIGGER sync_v2_public_effective_pricing_daily
  AFTER INSERT OR DELETE ON public.v2_request_pricing_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_public_effective_pricing_daily();

CREATE TRIGGER v2_request_pricing_lines_service_tier
  BEFORE INSERT OR UPDATE OF request_event_id, sku_id, sku_meter_id, meter_key ON public.v2_request_pricing_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_request_pricing_line_service_tier();

CREATE POLICY "v2_request_pricing_lines_workspace_select" ON "public"."v2_request_pricing_lines"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_pricing_lines.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_pricing_lines" TO "anon", "authenticated", "service_role";
