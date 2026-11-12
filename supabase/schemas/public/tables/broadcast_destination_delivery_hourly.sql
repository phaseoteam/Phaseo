CREATE TABLE "public"."broadcast_destination_delivery_hourly" (
  "destination_id" uuid                     NOT NULL,
  "hour"           timestamp with time zone NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "delivered"      integer                  NOT NULL DEFAULT 0,
  "failed"         integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "broadcast_destination_delivery_hourly_counts_check" CHECK (((delivered >= 0) AND (failed >= 0))),
  CONSTRAINT "broadcast_destination_delivery_hourly_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE,
  CONSTRAINT "broadcast_destination_delivery_hourly_pkey" PRIMARY KEY (destination_id, hour),
  CONSTRAINT "broadcast_destination_delivery_hourly_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_delivery_hourly"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_delivery_hourly_hour_idx ON public.broadcast_destination_delivery_hourly USING btree (hour);

CREATE INDEX broadcast_destination_delivery_hourly_workspace_hour_idx ON public.broadcast_destination_delivery_hourly USING btree (workspace_id, hour DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."broadcast_destination_delivery_hourly"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."broadcast_destination_delivery_hourly" IS 'Broadcast events delivered and finally failed per destination per UTC hour. Pruned after eight days by prune_broadcast_destination_delivery_hourly.';

REVOKE ALL ON TABLE "public"."broadcast_destination_delivery_hourly" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."broadcast_destination_delivery_hourly" TO "service_role";

REVOKE ALL ON TABLE "public"."broadcast_destination_delivery_hourly" FROM "anon", "authenticated";
