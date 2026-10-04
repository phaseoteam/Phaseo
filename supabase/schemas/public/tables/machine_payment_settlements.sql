CREATE TABLE "public"."machine_payment_settlements" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "authorization_id"       uuid                     NOT NULL,
  "request_id"             text                     NOT NULL,
  "actual_amount_nanos"    bigint                   NOT NULL,
  "currency"               text                     NOT NULL DEFAULT 'USD'::text,
  "provider"               text,
  "usage"                  jsonb,
  "external_settlement_id" text,
  "receipt"                jsonb,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "machine_payment_settlements_actual_amount_nanos_check" CHECK ((actual_amount_nanos >= 0)),
  CONSTRAINT "machine_payment_settlements_authorization_id_fkey" FOREIGN KEY (authorization_id) REFERENCES public.machine_payment_authorizations(id),
  CONSTRAINT "machine_payment_settlements_authorization_id_key" UNIQUE (authorization_id),
  CONSTRAINT "machine_payment_settlements_currency_check" CHECK ((currency = 'USD'::text)),
  CONSTRAINT "machine_payment_settlements_pkey" PRIMARY KEY (id),
  CONSTRAINT "machine_payment_settlements_request_id_key" UNIQUE (request_id)
);

ALTER TABLE "public"."machine_payment_settlements"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."machine_payment_settlements"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."machine_payment_settlements" FROM "service_role";

GRANT SELECT ON TABLE "public"."machine_payment_settlements" TO "service_role";

REVOKE ALL ON TABLE "public"."machine_payment_settlements" FROM "anon", "authenticated";
