-- phaseo:allow-destructive-migration reason: prune_broadcast_event_receipts deletes only expired Broadcast event receipts inside its function body; this migration itself deletes no data.
-- Receipts let the Broadcast queue consumer deliver an event emitted twice
-- (for example a realtime session settled again) only once: one batched
-- insert per queue batch, ignoring ids already present. Pruned after five days.
SET local check_function_bodies = off;

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

CREATE OR REPLACE FUNCTION public.prune_broadcast_event_receipts (
  p_limit integer DEFAULT 5000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_deleted integer;
begin
  -- Repeat emissions arrive within minutes. Five days outlasts the queue's
  -- default four-day message retention, so no queued message outlives its receipt.
  with expired as (
    select event_id
    from public.broadcast_event_receipts
    where received_at < now() - interval '5 days'
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
  )
  delete from public.broadcast_event_receipts receipts
  using expired
  where receipts.event_id = expired.event_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) IS 'Deletes a bounded batch of Broadcast event receipts older than five days.';

REVOKE ALL ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) FROM PUBLIC, "anon", "authenticated";
