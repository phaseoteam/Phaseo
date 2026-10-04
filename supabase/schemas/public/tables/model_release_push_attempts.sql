CREATE TABLE "public"."model_release_push_attempts" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "event_id"       uuid                     NOT NULL,
  "device_id"      uuid                     NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'pending'::text,
  "expo_ticket_id" text,
  "error_code"     text,
  "error_message"  text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at"        timestamp with time zone,
  CONSTRAINT "model_release_push_attempts_device_id_fkey" FOREIGN KEY (device_id) REFERENCES public.mobile_push_devices(id) ON DELETE CASCADE,
  CONSTRAINT "model_release_push_attempts_event_id_device_id_key" UNIQUE (event_id, device_id),
  CONSTRAINT "model_release_push_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "model_release_push_attempts_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]))),
  CONSTRAINT "model_release_push_attempts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.model_release_push_events(id) ON DELETE CASCADE
);

ALTER TABLE "public"."model_release_push_attempts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_release_push_attempts_device_id_idx ON public.model_release_push_attempts USING btree (device_id);

CREATE INDEX model_release_push_attempts_pending_idx ON public.model_release_push_attempts USING btree (event_id, status, created_at)
  WHERE (status = 'pending'::text);

CREATE POLICY "deny_direct_client_access" ON "public"."model_release_push_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."model_release_push_attempts" IS 'Per-device delivery state for model release push notifications.';

REVOKE ALL ON TABLE "public"."model_release_push_attempts" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."model_release_push_attempts" TO "service_role";

REVOKE ALL ON TABLE "public"."model_release_push_attempts" FROM "anon", "authenticated";
