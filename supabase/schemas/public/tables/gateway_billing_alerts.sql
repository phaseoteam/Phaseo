CREATE TABLE "public"."gateway_billing_alerts" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "operation_id" uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "resource_id"  text                     NOT NULL,
  "kind"         text                     NOT NULL,
  "provider"     text,
  "reason"       text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'open'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at"  timestamp with time zone,
  "event_id"     uuid,
  CONSTRAINT "gateway_billing_alerts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.email_outbox(id) ON DELETE RESTRICT,
  CONSTRAINT "gateway_billing_alerts_kind_check" CHECK ((kind = ANY (ARRAY['video'::text, 'batch'::text]))),
  CONSTRAINT "gateway_billing_alerts_operation_id_reason_key" UNIQUE (operation_id, reason),
  CONSTRAINT "gateway_billing_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_billing_alerts_reason_check" CHECK ((reason = 'unexpected_zero_cost'::text)),
  CONSTRAINT "gateway_billing_alerts_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])))
);

ALTER TABLE "public"."gateway_billing_alerts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_billing_alerts_event_id_idx ON public.gateway_billing_alerts USING btree (event_id);

CREATE INDEX gateway_billing_alerts_open_idx ON public.gateway_billing_alerts USING btree (created_at)
  WHERE (status = 'open'::text);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_billing_alerts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."gateway_billing_alerts" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."gateway_billing_alerts" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_billing_alerts" FROM "anon", "authenticated";
