CREATE TABLE "public"."broadcast_event_receipts" (
  "event_id"    text                     NOT NULL,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "broadcast_event_receipts_pkey" PRIMARY KEY (event_id)
);

ALTER TABLE "public"."broadcast_event_receipts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_event_receipts_received_at_idx ON public.broadcast_event_receipts USING btree (received_at);

CREATE POLICY "deny_direct_client_access" ON "public"."broadcast_event_receipts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."broadcast_event_receipts" IS 'Broadcast event ids already taken off the export queue, so an event emitted twice is delivered once. Pruned after five days by prune_broadcast_event_receipts.';

REVOKE ALL ON TABLE "public"."broadcast_event_receipts" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."broadcast_event_receipts" TO "service_role";

REVOKE ALL ON TABLE "public"."broadcast_event_receipts" FROM "anon", "authenticated";
