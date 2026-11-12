CREATE TABLE "public"."notification_routed_events" (
  "event_id"     uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "routed_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notification_routed_events_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  CONSTRAINT "notification_routed_events_pkey" PRIMARY KEY (event_id),
  CONSTRAINT "notification_routed_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."notification_routed_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX notification_routed_events_workspace_idx ON public.notification_routed_events USING btree (workspace_id, routed_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."notification_routed_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."notification_routed_events" IS 'Marks notification events after their destination routing has been snapshotted exactly once.';

REVOKE ALL ON TABLE "public"."notification_routed_events" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."notification_routed_events" TO "service_role";

REVOKE ALL ON TABLE "public"."notification_routed_events" FROM "anon", "authenticated";
