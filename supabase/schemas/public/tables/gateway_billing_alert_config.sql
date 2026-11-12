CREATE TABLE "public"."gateway_billing_alert_config" (
  "singleton"      boolean NOT NULL DEFAULT true,
  "destination_id" uuid,
  CONSTRAINT "gateway_billing_alert_config_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "gateway_billing_alert_config_singleton_check" CHECK (singleton),
  CONSTRAINT "gateway_billing_alert_config_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.notification_destinations(id) ON DELETE SET NULL
);

ALTER TABLE "public"."gateway_billing_alert_config"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_billing_alert_config_destination_id_idx ON public.gateway_billing_alert_config USING btree (destination_id);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_billing_alert_config"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."gateway_billing_alert_config" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."gateway_billing_alert_config" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_billing_alert_config" FROM "anon", "authenticated";
