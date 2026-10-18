CREATE TABLE "public"."mobile_push_deliveries" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"           uuid                     NOT NULL,
  "device_id"          uuid                     NOT NULL,
  "user_id"            uuid                     NOT NULL,
  "rule_id"            uuid,
  "status"             text                     NOT NULL DEFAULT 'pending'::text,
  "not_before"         timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"           integer                  NOT NULL DEFAULT 0,
  "claim_token"        uuid,
  "claimed_at"         timestamp with time zone,
  "expo_ticket_id"     text,
  "receipt_claimed_at" timestamp with time zone,
  "receipt_checked_at" timestamp with time zone,
  "error_code"         text,
  "error_message"      text,
  "sent_at"            timestamp with time zone,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mobile_push_deliveries_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "mobile_push_deliveries_event_id_device_id_key" UNIQUE (event_id, device_id),
  CONSTRAINT "mobile_push_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_deliveries_status_check"
    CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'deferred'::text, 'suppressed'::text]))),
  CONSTRAINT "mobile_push_deliveries_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.mobile_push_devices(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.catalogue_notification_events(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public.mobile_notification_rules(id) ON DELETE SET NULL,
  CONSTRAINT "mobile_push_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_push_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_deliveries_device_idx ON public.mobile_push_deliveries USING btree (device_id, created_at DESC);

CREATE INDEX mobile_push_deliveries_due_idx ON public.mobile_push_deliveries USING btree (not_before, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'deferred'::text]));

CREATE INDEX mobile_push_deliveries_processing_idx ON public.mobile_push_deliveries USING btree (claimed_at)
  WHERE (status = 'processing'::text);

CREATE INDEX mobile_push_deliveries_receipts_idx ON public.mobile_push_deliveries USING btree (sent_at)
  WHERE ((status = 'sent'::text) AND (expo_ticket_id IS NOT NULL) AND (receipt_checked_at IS NULL));

CREATE INDEX mobile_push_deliveries_rule_idx ON public.mobile_push_deliveries USING btree (rule_id)
  WHERE (rule_id IS NOT NULL);

CREATE INDEX mobile_push_deliveries_user_created_idx ON public.mobile_push_deliveries USING btree (user_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_deliveries"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_push_deliveries"."receipt_checked_at" IS 'When the Expo receipt was read, or when the ticket was closed unread a day after sending.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."receipt_claimed_at" IS 'When a run last asked Expo for the receipt. A receipt Expo did not return is asked for again 15 minutes later.';

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One mobile push per catalogue event and device. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "service_role";

GRANT SELECT ON TABLE "public"."mobile_push_deliveries" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "anon", "authenticated";
