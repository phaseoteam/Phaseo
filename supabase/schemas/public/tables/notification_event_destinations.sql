CREATE TABLE "public"."notification_event_destinations" (
  "workspace_id"   uuid                     NOT NULL,
  "event_kind"     text                     NOT NULL,
  "destination_id" uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notification_event_destinations_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.notification_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "notification_event_destinations_event_kind_check"
    CHECK ((event_kind = ANY (ARRAY['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text]))),
  CONSTRAINT "notification_event_destinations_pkey" PRIMARY KEY (workspace_id, event_kind, destination_id),
  CONSTRAINT "notification_event_destinations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."notification_event_destinations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX notification_event_destinations_destination_idx ON public.notification_event_destinations USING btree (destination_id);

CREATE POLICY "deny_direct_client_access" ON "public"."notification_event_destinations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."notification_event_destinations" IS 'Per-alert routing from workspace notification event kinds to reusable destinations.';

REVOKE ALL ON TABLE "public"."notification_event_destinations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."notification_event_destinations" TO "service_role";

REVOKE ALL ON TABLE "public"."notification_event_destinations" FROM "anon", "authenticated";
