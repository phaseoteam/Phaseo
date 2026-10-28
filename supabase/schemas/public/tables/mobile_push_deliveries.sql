CREATE TABLE "public"."mobile_push_deliveries" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"           uuid,
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
  "group_key"          text,
  "merged_into"        uuid,
  "workspace_id"       uuid,
  "digest_id"          uuid,
  "workspace_event_id" uuid,
  "message"            jsonb,
  CONSTRAINT "mobile_push_deliveries_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "mobile_push_deliveries_event_id_device_id_key" UNIQUE (event_id, device_id),
  CONSTRAINT "mobile_push_deliveries_message_check" CHECK (((event_id IS NOT NULL) OR (digest_id IS NOT NULL) OR (message IS NOT NULL))),
  CONSTRAINT "mobile_push_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "mobile_push_deliveries_status_check"
    CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'deferred'::text, 'suppressed'::text]))),
  CONSTRAINT "mobile_push_deliveries_workspace_event_id_device_id_key" UNIQUE (workspace_event_id, device_id),
  CONSTRAINT "mobile_push_deliveries_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.mobile_push_devices(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_digest_id_fkey" FOREIGN KEY (digest_id) REFERENCES public.mobile_push_digests(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.catalogue_notification_events(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_merged_into_fkey" FOREIGN KEY (merged_into) REFERENCES public.mobile_push_deliveries(id) ON DELETE SET NULL,
  CONSTRAINT "mobile_push_deliveries_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public.mobile_notification_rules(id) ON DELETE SET NULL,
  CONSTRAINT "mobile_push_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_workspace_event_id_fkey" FOREIGN KEY (workspace_event_id) REFERENCES public.workspace_notification_events(id) ON DELETE CASCADE,
  CONSTRAINT "mobile_push_deliveries_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mobile_push_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mobile_push_deliveries_device_idx ON public.mobile_push_deliveries USING btree (device_id, created_at DESC);

CREATE UNIQUE INDEX mobile_push_deliveries_digest_device_key ON public.mobile_push_deliveries USING btree (digest_id, device_id)
  WHERE (digest_id IS NOT NULL);

CREATE INDEX mobile_push_deliveries_digest_due_idx ON public.mobile_push_deliveries USING btree (not_before, created_at)
  WHERE ((digest_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'deferred'::text])));

CREATE INDEX mobile_push_deliveries_due_idx ON public.mobile_push_deliveries USING btree (not_before, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'deferred'::text]));

CREATE INDEX mobile_push_deliveries_merged_into_idx ON public.mobile_push_deliveries USING btree (merged_into)
  WHERE (merged_into IS NOT NULL);

CREATE INDEX mobile_push_deliveries_processing_idx ON public.mobile_push_deliveries USING btree (claimed_at)
  WHERE (status = 'processing'::text);

CREATE INDEX mobile_push_deliveries_receipts_idx ON public.mobile_push_deliveries USING btree (sent_at)
  WHERE ((status = 'sent'::text) AND (expo_ticket_id IS NOT NULL) AND (receipt_checked_at IS NULL));

CREATE INDEX mobile_push_deliveries_rule_idx ON public.mobile_push_deliveries USING btree (rule_id)
  WHERE (rule_id IS NOT NULL);

CREATE INDEX mobile_push_deliveries_user_created_idx ON public.mobile_push_deliveries USING btree (user_id, created_at DESC);

CREATE INDEX mobile_push_deliveries_workspace_idx ON public.mobile_push_deliveries USING btree (workspace_id)
  WHERE (workspace_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."mobile_push_deliveries"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."mobile_push_deliveries"."digest_id" IS 'The weekly digest this row sends; such rows have no catalogue event. Claimed by claim_mobile_push_digests, never by claim_mobile_push_deliveries, and never counted against the daily cap.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."group_key" IS 'Deliveries for one device that share a key and are due together go out as one push: release:<lab> for releases and Phaseo availability, provider:<provider> for new providers of a model, price:<model> for price changes. Null is sent alone.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."event_id" IS 'The catalogue event this push is about. Null for workspace alerts, which carry their own message, and for weekly digests (digest_id).';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."merged_into" IS 'The delivery whose push carried this one. Only that delivery holds the Expo ticket.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."message" IS 'Text of a push that is not about a catalogue event, written for its recipient when it was queued: kind, category, title, body, href and modelSlug.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."receipt_checked_at" IS 'When the Expo receipt was read, or when the ticket was closed unread a day after sending.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."receipt_claimed_at" IS 'When a run last asked Expo for the receipt. A receipt Expo did not return is asked for again 15 minutes later.';

COMMENT ON TABLE "public"."mobile_push_deliveries" IS 'One row per catalogue event and device, per workspace event and device (workspace alerts, with their own message), or per weekly digest and device (digest_id). Catalogue rows wait five minutes to settle, and those due for the same device and group key are sent as one push; workspace rows are due at once and sent alone. Deferred rows wait for quiet hours to end; suppressed rows were over the daily cap or no longer wanted. Claimed with a token so overlapping runs never send twice.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."workspace_event_id" IS 'The workspace event this push is about, for workspace alerts.';

COMMENT ON COLUMN "public"."mobile_push_deliveries"."workspace_id" IS 'Workspace a workspace alert is about. Null for catalogue news. The push names it to members of more than one workspace and is closed unsent if the recipient has left it.';

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "service_role";

GRANT SELECT ON TABLE "public"."mobile_push_deliveries" TO "service_role";

REVOKE ALL ON TABLE "public"."mobile_push_deliveries" FROM "anon", "authenticated";
