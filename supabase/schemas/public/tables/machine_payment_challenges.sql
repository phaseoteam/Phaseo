CREATE TABLE "public"."machine_payment_challenges" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_hash"          text                     NOT NULL,
  "pricing_snapshot_hash" text                     NOT NULL,
  "endpoint"              text                     NOT NULL,
  "model"                 text                     NOT NULL,
  "amount_nanos"          bigint                   NOT NULL,
  "currency"              text                     NOT NULL DEFAULT 'USD'::text,
  "expires_at"            timestamp with time zone NOT NULL,
  "metadata"              jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "machine_payment_challenges_amount_nanos_check" CHECK ((amount_nanos > 0)),
  CONSTRAINT "machine_payment_challenges_currency_check" CHECK ((currency = 'USD'::text)),
  CONSTRAINT "machine_payment_challenges_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."machine_payment_challenges"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."machine_payment_challenges"
  ADD COLUMN "status" public.machine_payment_challenge_status NOT NULL DEFAULT 'open'::public.machine_payment_challenge_status;

ALTER TABLE "public"."machine_payment_challenges"
  ADD COLUMN "allowed_protocols" public.machine_payment_protocol[] NOT NULL;

CREATE INDEX machine_payment_challenges_expiry_idx ON public.machine_payment_challenges USING btree (expires_at)
  WHERE (status = 'open'::public.machine_payment_challenge_status);

CREATE POLICY "deny_direct_client_access" ON "public"."machine_payment_challenges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."machine_payment_challenges" FROM "service_role";

GRANT SELECT ON TABLE "public"."machine_payment_challenges" TO "service_role";

REVOKE ALL ON TABLE "public"."machine_payment_challenges" FROM "anon", "authenticated";
