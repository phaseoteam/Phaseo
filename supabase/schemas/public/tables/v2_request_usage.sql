CREATE TABLE "public"."v2_request_usage" (
  "usage_id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_event_id" uuid                     NOT NULL,
  "sku_meter_id"     uuid,
  "meter_key"        text                     NOT NULL,
  "modality"         text                     NOT NULL,
  "unit"             text                     NOT NULL,
  "quantity"         numeric(30,12)           NOT NULL,
  "source"           text                     NOT NULL DEFAULT 'provider'::text,
  "billable"         boolean                  NOT NULL DEFAULT true,
  "sequence"         integer                  NOT NULL DEFAULT 0,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_request_usage_key" UNIQUE (request_event_id, meter_key, SEQUENCE),
  CONSTRAINT "v2_request_usage_pkey" PRIMARY KEY (usage_id),
  CONSTRAINT "v2_request_usage_quantity_check" CHECK ((quantity >= (0)::numeric)),
  CONSTRAINT "v2_request_usage_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_request_usage_sequence_check" CHECK ((sequence >= 0)),
  CONSTRAINT "v2_request_usage_sku_meter_id_fkey" FOREIGN KEY (sku_meter_id) REFERENCES public.v2_pricing_sku_meters(sku_meter_id) ON DELETE SET NULL
);

ALTER TABLE "public"."v2_request_usage"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_request_usage_meter_time_idx ON public.v2_request_usage USING btree (meter_key, created_at DESC);

CREATE INDEX v2_request_usage_modality_time_idx ON public.v2_request_usage USING btree (modality, created_at DESC);

CREATE INDEX v2_request_usage_request_idx ON public.v2_request_usage USING btree (request_event_id, meter_key);

CREATE INDEX v2_request_usage_public_ranking_idx ON public.v2_request_usage USING btree (request_event_id, meter_key) INCLUDE (quantity);

CREATE INDEX v2_request_usage_public_tokens_idx ON public.v2_request_usage USING btree (request_event_id, meter_key) INCLUDE (quantity)
  WHERE (meter_key = ANY (ARRAY['input_tokens'::text, 'output_tokens'::text, 'prompt_tokens'::text, 'input_text_tokens'::text, 'output_text_tokens'::text, 'input_image_tokens'::text, 'output_image_tokens'::text, 'input_audio_tokens'::text, 'output_audio_tokens'::text, 'input_video_tokens'::text, 'output_video_tokens'::text]));

CREATE INDEX v2_request_usage_sku_meter_id_idx ON public.v2_request_usage USING btree (sku_meter_id)
  WHERE (sku_meter_id IS NOT NULL);

CREATE TRIGGER v2_request_usage_analytics_correction
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_request_usage
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_v2_analytics_meter_correction();

CREATE TRIGGER v2_request_usage_public_reporting_refresh
  BEFORE INSERT OR DELETE OR UPDATE ON public.v2_request_usage
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_public_reporting_for_usage();

CREATE TRIGGER v2_request_usage_service_tier
  BEFORE INSERT OR UPDATE OF request_event_id, sku_meter_id, meter_key ON public.v2_request_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_request_usage_service_tier();

CREATE POLICY "v2_request_usage_workspace_select" ON "public"."v2_request_usage"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_usage.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_usage" TO "anon", "authenticated", "service_role";
