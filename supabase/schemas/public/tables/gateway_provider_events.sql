CREATE TABLE "public"."gateway_provider_events" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider"          text                     NOT NULL,
  "provider_event_id" text                     NOT NULL,
  "kind"              text,
  "workspace_id"      uuid,
  "internal_id"       text,
  "payload"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "headers"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "processed_at"      timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "attempt_count"     integer                  NOT NULL DEFAULT 0,
  "next_attempt_at"   timestamp with time zone,
  "last_error"        text,
  "dead_lettered_at"  timestamp with time zone,
  "replay_locked_at"  timestamp with time zone,
  "replay_locked_by"  text,
  CONSTRAINT "gateway_provider_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_provider_events_provider_event_unique" UNIQUE (PROVIDER, provider_event_id),
  CONSTRAINT "gateway_provider_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL
);

ALTER TABLE "public"."gateway_provider_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_provider_events_provider_created_idx ON public.gateway_provider_events USING btree (PROVIDER, created_at DESC);

CREATE INDEX gateway_provider_events_replay_due_idx ON public.gateway_provider_events USING btree (next_attempt_at, created_at)
  WHERE (processed_at IS NULL);

CREATE INDEX gateway_provider_events_workspace_created_idx ON public.gateway_provider_events USING btree (workspace_id, created_at DESC)
  WHERE (workspace_id IS NOT NULL);

CREATE POLICY "gateway_provider_events_insert_service" ON "public"."gateway_provider_events"
  FOR INSERT
  TO "service_role"
  WITH CHECK (true);

CREATE POLICY "gateway_provider_events_select_service" ON "public"."gateway_provider_events"
  FOR SELECT
  TO "service_role"
  USING (true);

CREATE POLICY "gateway_provider_events_update_service" ON "public"."gateway_provider_events"
  FOR UPDATE
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_provider_events" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_provider_events" IS 'Webhook/provider event dedupe + processing audit trail for long-running operations.';
