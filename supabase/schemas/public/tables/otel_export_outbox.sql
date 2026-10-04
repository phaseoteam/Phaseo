CREATE TABLE "public"."otel_export_outbox" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     uuid                     NOT NULL,
  "destination_id"   uuid                     NOT NULL,
  "event_id"         text                     NOT NULL,
  "payload"          jsonb                    NOT NULL,
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "attempts"         integer                  NOT NULL DEFAULT 0,
  "next_attempt_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "lease_expires_at" timestamp with time zone,
  "delivered_at"     timestamp with time zone,
  "last_http_status" integer,
  "last_error"       text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "otel_export_outbox_destination_id_event_id_key" UNIQUE (destination_id, event_id),
  CONSTRAINT "otel_export_outbox_pkey" PRIMARY KEY (id),
  CONSTRAINT "otel_export_outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'delivered'::text, 'failed'::text]))),
  CONSTRAINT "otel_export_outbox_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "otel_export_outbox_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."otel_export_outbox"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX otel_export_outbox_pending_idx ON public.otel_export_outbox USING btree (next_attempt_at, created_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));

CREATE INDEX otel_export_outbox_workspace_id_idx ON public.otel_export_outbox USING btree (workspace_id);

CREATE POLICY "service_role_full_access" ON "public"."otel_export_outbox"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."otel_export_outbox" TO "service_role";

REVOKE ALL ON TABLE "public"."otel_export_outbox" FROM "anon", "authenticated";
