CREATE TABLE "public"."v2_analytics_outbox" (
  "request_event_id" uuid                     NOT NULL,
  "workspace_id"     uuid                     NOT NULL,
  "occurred_at"      timestamp with time zone NOT NULL,
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "attempt_count"    integer                  NOT NULL DEFAULT 0,
  "available_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "last_error"       text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_analytics_outbox_attempt_count_check" CHECK ((attempt_count >= 0)),
  CONSTRAINT "v2_analytics_outbox_pkey" PRIMARY KEY (request_event_id),
  CONSTRAINT "v2_analytics_outbox_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'complete'::text, 'failed'::text]))),
  CONSTRAINT "v2_analytics_outbox_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE,
  CONSTRAINT "v2_analytics_outbox_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_analytics_outbox"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_analytics_outbox_pending_idx ON public.v2_analytics_outbox USING btree (status, available_at, occurred_at)
  WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

CREATE INDEX v2_analytics_outbox_workspace_time_idx ON public.v2_analytics_outbox USING btree (workspace_id, occurred_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."v2_analytics_outbox"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_analytics_outbox" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_analytics_outbox" FROM "anon", "authenticated";

CREATE INDEX v2_analytics_outbox_completed_retention_idx ON public.v2_analytics_outbox USING btree (updated_at, request_event_id)
  WHERE (status = 'complete'::text);
