CREATE TABLE "public"."gateway_realtime_billing_decisions" (
  "operation_id"   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "session_id"     text                     NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "actor_user_id"  text,
  "action"         text                     NOT NULL,
  "reason"         text                     NOT NULL,
  "review_version" bigint                   NOT NULL,
  "cost_nanos"     bigint,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_realtime_billing_decisions_pkey" PRIMARY KEY (operation_id),
  CONSTRAINT "gateway_realtime_billing_decisions_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.gateway_realtime_billing_reviews(session_id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_realtime_billing_decisions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_realtime_billing_decisions_session_id_created_at_idx ON public.gateway_realtime_billing_decisions USING btree (session_id, created_at);

REVOKE ALL ON TABLE "public"."gateway_realtime_billing_decisions" FROM "service_role";

GRANT SELECT ON TABLE "public"."gateway_realtime_billing_decisions" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_realtime_billing_decisions" FROM "anon", "authenticated";
