CREATE TABLE "public"."machine_payment_events" (
  "id"               bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "authorization_id" uuid,
  "challenge_id"     uuid,
  "event_type"       text                     NOT NULL,
  "idempotency_key"  text                     NOT NULL,
  "payload"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "machine_payment_events_authorization_id_fkey" FOREIGN KEY (authorization_id) REFERENCES public.machine_payment_authorizations(id),
  CONSTRAINT "machine_payment_events_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.machine_payment_challenges(id),
  CONSTRAINT "machine_payment_events_idempotency_key_key" UNIQUE (idempotency_key),
  CONSTRAINT "machine_payment_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."machine_payment_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX machine_payment_events_authorization_idx ON public.machine_payment_events USING btree (authorization_id, created_at);

CREATE INDEX machine_payment_events_challenge_id_idx ON public.machine_payment_events USING btree (challenge_id);

CREATE POLICY "deny_direct_client_access" ON "public"."machine_payment_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."machine_payment_events" FROM "anon", "authenticated", "service_role";

REVOKE ALL ON SEQUENCE "public"."machine_payment_events_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."machine_payment_events_id_seq" FROM "authenticated";

REVOKE ALL ON SEQUENCE "public"."machine_payment_events_id_seq" FROM "service_role";
