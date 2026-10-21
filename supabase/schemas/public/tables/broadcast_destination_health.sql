CREATE TABLE "public"."broadcast_destination_health" (
  "destination_id"       uuid                     NOT NULL,
  "workspace_id"         uuid                     NOT NULL,
  "last_success_at"      timestamp with time zone,
  "last_failure_at"      timestamp with time zone,
  "last_http_status"     integer,
  "last_error"           text,
  "consecutive_failures" integer                  NOT NULL DEFAULT 0,
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "alerted_at"           timestamp with time zone,
  CONSTRAINT "broadcast_destination_health_consecutive_failures_check" CHECK ((consecutive_failures >= 0)),
  CONSTRAINT "broadcast_destination_health_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "broadcast_destination_health_pkey" PRIMARY KEY (destination_id),
  CONSTRAINT "broadcast_destination_health_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_health"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_health_workspace_id_idx ON public.broadcast_destination_health USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."broadcast_destination_health"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."broadcast_destination_health"."alerted_at" IS 'When enqueue_broadcast_destination_alerts last alerted about this destination failing. A destination is alerted again only after a later success and at least six hours.';

COMMENT ON TABLE "public"."broadcast_destination_health" IS 'Latest delivery outcome for each Broadcast destination, written by record_broadcast_destination_health. consecutive_failures counts failed export requests since the last successful one.';

REVOKE ALL ON TABLE "public"."broadcast_destination_health" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."broadcast_destination_health" TO "service_role";

REVOKE ALL ON TABLE "public"."broadcast_destination_health" FROM "anon", "authenticated";
