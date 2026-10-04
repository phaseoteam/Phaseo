CREATE TABLE "public"."email_delivery_suppressions" (
  "recipient_email_hash" text                     NOT NULL,
  "reason"               text                     NOT NULL,
  "source_event_id"      text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "email_delivery_suppressions_pkey" PRIMARY KEY (recipient_email_hash),
  CONSTRAINT "email_delivery_suppressions_reason_check" CHECK ((reason = ANY (ARRAY['bounced'::text, 'complained'::text, 'suppressed'::text]))),
  CONSTRAINT "email_delivery_suppressions_source_event_id_fkey" FOREIGN KEY (source_event_id) REFERENCES public.resend_webhook_events(id) ON DELETE SET NULL
);

ALTER TABLE "public"."email_delivery_suppressions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX email_delivery_suppressions_source_event_id_idx ON public.email_delivery_suppressions USING btree (source_event_id);

CREATE POLICY "deny_direct_client_access" ON "public"."email_delivery_suppressions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."email_delivery_suppressions" IS 'Recipients that must not be retried after a Resend bounce, complaint, or suppression event.';

REVOKE ALL ON TABLE "public"."email_delivery_suppressions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."email_delivery_suppressions" TO "service_role";

REVOKE ALL ON TABLE "public"."email_delivery_suppressions" FROM "anon", "authenticated";
