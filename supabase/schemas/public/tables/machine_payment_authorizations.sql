CREATE TABLE "public"."machine_payment_authorizations" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "challenge_id"              uuid                     NOT NULL,
  "payer_id"                  text                     NOT NULL,
  "external_authorization_id" text                     NOT NULL,
  "request_hash"              text                     NOT NULL,
  "pricing_snapshot_hash"     text                     NOT NULL,
  "max_amount_nanos"          bigint                   NOT NULL,
  "currency"                  text                     NOT NULL DEFAULT 'USD'::text,
  "credential_fingerprint"    text                     NOT NULL,
  "claimed_request_id"        text,
  "job_kind"                  text,
  "job_id"                    text,
  "expires_at"                timestamp with time zone NOT NULL,
  "authorized_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "claimed_at"                timestamp with time zone,
  "settled_at"                timestamp with time zone,
  "metadata"                  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "machine_payment_authorizations_check" CHECK (((job_kind IS NULL) = (job_id IS NULL))),
  CONSTRAINT "machine_payment_authorizations_claimed_request_id_key" UNIQUE (claimed_request_id),
  CONSTRAINT "machine_payment_authorizations_credential_fingerprint_key" UNIQUE (credential_fingerprint),
  CONSTRAINT "machine_payment_authorizations_currency_check" CHECK ((currency = 'USD'::text)),
  CONSTRAINT "machine_payment_authorizations_job_kind_check" CHECK (((job_kind IS NULL) OR (job_kind = ANY (ARRAY['video'::text, 'batch'::text])))),
  CONSTRAINT "machine_payment_authorizations_max_amount_nanos_check" CHECK ((max_amount_nanos > 0)),
  CONSTRAINT "machine_payment_authorizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "machine_payment_authorizations_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.machine_payment_challenges(id)
);

ALTER TABLE "public"."machine_payment_authorizations"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."machine_payment_authorizations"
  ADD COLUMN "status" public.machine_payment_authorization_status NOT NULL DEFAULT 'authorized'::public.machine_payment_authorization_status;

ALTER TABLE "public"."machine_payment_authorizations"
  ADD COLUMN "mode" public.machine_payment_mode NOT NULL;

ALTER TABLE "public"."machine_payment_authorizations"
  ADD COLUMN "protocol" public.machine_payment_protocol NOT NULL;

ALTER TABLE "public"."machine_payment_authorizations"
  ADD CONSTRAINT "machine_payment_authorization_protocol_external_authorizati_key" UNIQUE (protocol, external_authorization_id);

CREATE INDEX machine_payment_authorizations_challenge_id_idx ON public.machine_payment_authorizations USING btree (challenge_id);

CREATE INDEX machine_payment_authorizations_job_idx ON public.machine_payment_authorizations USING btree (job_kind, job_id)
  WHERE (job_id IS NOT NULL);

CREATE INDEX machine_payment_authorizations_reconcile_idx ON public.machine_payment_authorizations USING btree (status, expires_at);

CREATE POLICY "deny_direct_client_access" ON "public"."machine_payment_authorizations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."machine_payment_authorizations" FROM "anon", "authenticated", "service_role";
