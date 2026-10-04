CREATE TABLE "public"."gateway_realtime_billing_reviews" (
  "session_id"           text                     NOT NULL,
  "workspace_id"         uuid                     NOT NULL,
  "status"               text                     NOT NULL DEFAULT 'open'::text,
  "access_blocked"       boolean                  NOT NULL DEFAULT true,
  "version"              bigint                   NOT NULL DEFAULT 1,
  "opened_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "review_due_at"        timestamp with time zone NOT NULL DEFAULT (now() + '1 day'::interval),
  "retry_after"          timestamp with time zone NOT NULL DEFAULT now(),
  "attempts"             integer                  NOT NULL DEFAULT 0,
  "last_attempt_at"      timestamp with time zone,
  "recovery_error"       text,
  "evidence_usage"       jsonb,
  "evidence_metadata"    jsonb,
  "billable_usage"       jsonb,
  "confirmed_cost_nanos" bigint,
  "pricing_lines"        jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "evidence_complete"    boolean                  NOT NULL DEFAULT false,
  "resolved_at"          timestamp with time zone,
  "summary_synced_at"    timestamp with time zone,
  CONSTRAINT "gateway_realtime_billing_reviews_confirmed_cost_nanos_check" CHECK ((confirmed_cost_nanos >= 0)),
  CONSTRAINT "gateway_realtime_billing_reviews_pkey" PRIMARY KEY (session_id),
  CONSTRAINT "gateway_realtime_billing_reviews_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text]))),
  CONSTRAINT "gateway_realtime_billing_reviews_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.gateway_realtime_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT "gateway_realtime_billing_reviews_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_realtime_billing_reviews"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_realtime_billing_reviews_retry_after_idx ON public.gateway_realtime_billing_reviews USING btree (retry_after)
  WHERE (status = 'open'::text);

CREATE INDEX gateway_realtime_billing_reviews_workspace_id_idx1 ON public.gateway_realtime_billing_reviews USING btree (workspace_id);

CREATE INDEX gateway_realtime_billing_reviews_workspace_id_idx ON public.gateway_realtime_billing_reviews USING btree (workspace_id)
  WHERE access_blocked;

REVOKE ALL ON TABLE "public"."gateway_realtime_billing_reviews" FROM "service_role";

GRANT SELECT ON TABLE "public"."gateway_realtime_billing_reviews" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_realtime_billing_reviews" FROM "anon", "authenticated";
