CREATE TABLE "public"."gateway_wallet_reservations" (
  "workspace_id"          uuid                     NOT NULL,
  "reservation_id"        text                     NOT NULL,
  "amount_nanos"          bigint                   NOT NULL,
  "status"                text                     NOT NULL,
  "hold_ref_id"           text,
  "capture_ref_id"        text,
  "release_ref_id"        text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "settled_amount_nanos"  bigint,
  "captured_nanos"        bigint                   NOT NULL DEFAULT 0,
  "released_nanos"        bigint                   NOT NULL DEFAULT 0,
  "captured_at"           timestamp with time zone,
  "released_at"           timestamp with time zone,
  "key_id"                uuid,
  "request_count"         integer,
  "key_usage_recorded_at" timestamp with time zone,
  CONSTRAINT "gateway_wallet_reservations_amount_nanos_check" CHECK ((amount_nanos > 0)),
  CONSTRAINT "gateway_wallet_reservations_capture_amount_check" CHECK (((captured_nanos >= 0) AND (released_nanos >= 0) AND ((captured_nanos + released_nanos) <= amount_nanos))),
  CONSTRAINT "gateway_wallet_reservations_pkey" PRIMARY KEY (workspace_id, reservation_id),
  CONSTRAINT "gateway_wallet_reservations_request_count_check" CHECK (((request_count IS NULL) OR (request_count > 0))),
  CONSTRAINT "gateway_wallet_reservations_status_check" CHECK ((status = ANY (ARRAY['held'::text, 'reserved'::text, 'captured'::text, 'released'::text]))),
  CONSTRAINT "gateway_wallet_reservations_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_wallet_reservations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_wallet_reservations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_wallet_reservations_key_pending_idx ON public.gateway_wallet_reservations USING btree (key_id, status, created_at)
  WHERE (key_id IS NOT NULL);

CREATE INDEX idx_gateway_wallet_reservations_status_updated ON public.gateway_wallet_reservations USING btree (status, updated_at DESC);

CREATE TRIGGER gateway_cleanup_batch_hold_key_usage_trigger
  AFTER UPDATE OF status ON public.gateway_wallet_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_cleanup_batch_hold_key_usage();

CREATE POLICY "gateway_wallet_reservations_select_own_team" ON "public"."gateway_wallet_reservations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "gateway_wallet_reservations_service_all" ON "public"."gateway_wallet_reservations"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_wallet_reservations" TO "anon", "authenticated", "service_role";
