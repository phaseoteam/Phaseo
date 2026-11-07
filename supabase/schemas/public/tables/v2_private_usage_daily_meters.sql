CREATE TABLE "public"."v2_private_usage_daily_meters" (
  "rollup_id"  uuid                     NOT NULL,
  "meter_key"  text                     NOT NULL,
  "modality"   text                     NOT NULL,
  "unit"       text                     NOT NULL,
  "quantity"   numeric(30,12)           NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_private_usage_daily_meters_pkey" PRIMARY KEY (rollup_id, meter_key, modality, unit),
  CONSTRAINT "v2_private_usage_daily_meters_quantity_check" CHECK ((quantity >= (0)::numeric)),
  CONSTRAINT "v2_private_usage_daily_meters_rollup_id_fkey" FOREIGN KEY (rollup_id) REFERENCES public.v2_private_usage_daily(rollup_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_private_usage_daily_meters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_private_usage_daily_meters_lookup_idx ON public.v2_private_usage_daily_meters USING btree (meter_key, modality, unit, rollup_id);

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_insert" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_update" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_private_usage_daily_meters_no_oauth_client_delete" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_private_usage_daily_meters"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "v2_private_usage_daily_meters_workspace_select" ON "public"."v2_private_usage_daily_meters"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_private_usage_daily rollup
  WHERE ((rollup.rollup_id = v2_private_usage_daily_meters.rollup_id) AND ( SELECT public.is_workspace_member(rollup.workspace_id) AS is_workspace_member)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_private_usage_daily_meters" TO "anon", "authenticated", "service_role";
