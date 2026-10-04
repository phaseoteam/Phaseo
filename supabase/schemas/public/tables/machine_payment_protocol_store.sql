CREATE TABLE "public"."machine_payment_protocol_store" (
  "key"        text                     NOT NULL,
  "value"      jsonb                    NOT NULL,
  "version"    bigint                   NOT NULL DEFAULT 1,
  "expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "machine_payment_protocol_store_pkey" PRIMARY KEY (key)
);

ALTER TABLE "public"."machine_payment_protocol_store"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX machine_payment_protocol_store_expiry_idx ON public.machine_payment_protocol_store USING btree (expires_at)
  WHERE (expires_at IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."machine_payment_protocol_store"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."machine_payment_protocol_store" FROM "anon", "authenticated", "service_role";
