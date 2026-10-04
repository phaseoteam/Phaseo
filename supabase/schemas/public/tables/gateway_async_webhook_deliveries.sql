CREATE TABLE "public"."gateway_async_webhook_deliveries" (
  "workspace_id"    uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "internal_id"     text                     NOT NULL,
  "delivery_key"    text                     NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'claimed'::text,
  "claim_token"     text,
  "claimed_at"      timestamp with time zone,
  "delivered_at"    timestamp with time zone,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "event_type"      text,
  "phase"           text,
  "progress"        double precision,
  "previous_status" text,
  "current_status"  text,
  "next_attempt_at" timestamp with time zone,
  "last_error"      text,
  CONSTRAINT "gateway_async_webhook_deliveries_pkey" PRIMARY KEY (workspace_id, kind, internal_id, delivery_key),
  CONSTRAINT "gateway_async_webhook_delivery_status_check" CHECK ((status = ANY (ARRAY['claimed'::text, 'pending'::text, 'delivered'::text, 'failed'::text])))
);

ALTER TABLE "public"."gateway_async_webhook_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_async_webhook_deliveries_claimed_idx ON public.gateway_async_webhook_deliveries USING btree (claimed_at)
  WHERE (status = 'claimed'::text);

CREATE INDEX gateway_async_webhook_deliveries_pending_idx ON public.gateway_async_webhook_deliveries USING btree (next_attempt_at, updated_at)
  WHERE (status = 'pending'::text);

CREATE POLICY "service_role_full_access" ON "public"."gateway_async_webhook_deliveries"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_async_webhook_deliveries" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_async_webhook_deliveries" FROM "anon", "authenticated";
