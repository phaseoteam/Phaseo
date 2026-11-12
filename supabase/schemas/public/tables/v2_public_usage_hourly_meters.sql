CREATE TABLE "public"."v2_public_usage_hourly_meters" (
  "rollup_id"  uuid                     NOT NULL,
  "meter_key"  text                     NOT NULL,
  "modality"   text                     NOT NULL,
  "unit"       text                     NOT NULL,
  "quantity"   numeric(30,12)           NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_public_usage_hourly_meters_pkey" PRIMARY KEY (rollup_id, meter_key, modality, unit),
  CONSTRAINT "v2_public_usage_hourly_meters_quantity_check" CHECK ((quantity >= (0)::numeric)),
  CONSTRAINT "v2_public_usage_hourly_meters_rollup_id_fkey" FOREIGN KEY (rollup_id) REFERENCES public.v2_public_usage_hourly(rollup_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_public_usage_hourly_meters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_public_usage_hourly_meters_lookup_idx ON public.v2_public_usage_hourly_meters USING btree (meter_key, modality, unit, rollup_id);

CREATE POLICY "v2_public_usage_hourly_meters_public_select" ON "public"."v2_public_usage_hourly_meters"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_public_usage_hourly rollup
  WHERE (rollup.rollup_id = v2_public_usage_hourly_meters.rollup_id))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_public_usage_hourly_meters" TO "anon", "authenticated", "service_role";

create policy public_usage_meter_visibility on public.v2_public_usage_hourly_meters as restrictive
for select to anon, authenticated using (exists (
  select 1 from public.v2_public_usage_hourly usage where usage.rollup_id = v2_public_usage_hourly_meters.rollup_id
));
