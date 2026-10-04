CREATE TABLE "public"."notification_delivery_attempts" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"        uuid                     NOT NULL,
  "destination_id"  uuid                     NOT NULL,
  "workspace_id"    uuid                     NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'pending'::text,
  "attempts"        integer                  NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_error"      text,
  "response_status" integer,
  "sent_at"         timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "claim_token"     uuid,
  "claimed_at"      timestamp with time zone,
  CONSTRAINT "notification_delivery_attempts_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "notification_delivery_attempts_event_id_destination_id_key" UNIQUE (event_id, destination_id),
  CONSTRAINT "notification_delivery_attempts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "notification_delivery_attempts_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'retry'::text, 'processing'::text, 'sent'::text, 'failed'::text]))),
  CONSTRAINT "notification_delivery_attempts_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.notification_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "notification_delivery_attempts_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."notification_delivery_attempts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX notification_delivery_attempts_destination_id_idx ON public.notification_delivery_attempts USING btree (destination_id);

CREATE INDEX notification_delivery_attempts_pending_idx ON public.notification_delivery_attempts USING btree (status, next_attempt_at, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'retry'::text]));

CREATE INDEX notification_delivery_attempts_workspace_id_idx ON public.notification_delivery_attempts USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."notification_delivery_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."notification_delivery_attempts" IS 'Deduplicated delivery state and retry history for workspace notification events.';

REVOKE ALL ON TABLE "public"."notification_delivery_attempts" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."notification_delivery_attempts" TO "service_role";

REVOKE ALL ON TABLE "public"."notification_delivery_attempts" FROM "anon", "authenticated";
