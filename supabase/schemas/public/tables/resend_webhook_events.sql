CREATE TABLE "public"."resend_webhook_events" (
  "id"                   text                     NOT NULL,
  "event_type"           text                     NOT NULL,
  "email_id"             text,
  "recipient_email_hash" text,
  "event_created_at"     timestamp with time zone,
  "received_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "resend_webhook_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."resend_webhook_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX resend_webhook_events_email_idx ON public.resend_webhook_events USING btree (email_id, received_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."resend_webhook_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."resend_webhook_events" IS 'Idempotency and operational metadata for verified Resend delivery webhooks. Recipient addresses are stored only as SHA-256 hashes.';

REVOKE ALL ON TABLE "public"."resend_webhook_events" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."resend_webhook_events" TO "service_role";

REVOKE ALL ON TABLE "public"."resend_webhook_events" FROM "anon", "authenticated";
