CREATE TABLE "public"."v2_public_usage_daily_meters" (
  "rollup_id"  uuid                     NOT NULL,
  "meter_key"  text                     NOT NULL,
  "modality"   text                     NOT NULL,
  "unit"       text                     NOT NULL,
  "quantity"   numeric(30,12)           NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_public_usage_daily_meters_pkey" PRIMARY KEY (rollup_id, meter_key, modality, unit),
  CONSTRAINT "v2_public_usage_daily_meters_quantity_check" CHECK ((quantity >= (0)::numeric)),
  CONSTRAINT "v2_public_usage_daily_meters_rollup_id_fkey" FOREIGN KEY (rollup_id) REFERENCES public.v2_public_usage_daily(rollup_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_public_usage_daily_meters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_public_usage_daily_meters_lookup_idx ON public.v2_public_usage_daily_meters USING btree (meter_key, modality, unit, rollup_id);

CREATE POLICY "v2_public_usage_daily_meters_public_select" ON "public"."v2_public_usage_daily_meters"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_public_usage_daily rollup
  WHERE (rollup.rollup_id = v2_public_usage_daily_meters.rollup_id))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_public_usage_daily_meters" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_public_usage_daily_meters"."meter_key" IS 'Includes modality-specific meters such as tokens, images, characters, requests, and media seconds.';
