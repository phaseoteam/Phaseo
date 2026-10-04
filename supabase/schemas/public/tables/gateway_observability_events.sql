CREATE TABLE "public"."gateway_observability_events" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "request_id"          text,
  "session_id"          text,
  "preset_id"           uuid,
  "test_run_id"         uuid,
  "category"            text                     NOT NULL DEFAULT 'custom'::text,
  "event_name"          text                     NOT NULL,
  "value"               jsonb,
  "numeric_value"       numeric,
  "metadata"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "metadata_dimensions" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "end_user_id"         text,
  "source"              text                     NOT NULL DEFAULT 'api'::text,
  "occurred_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"  uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_observability_events_category_check"
    CHECK ((category = ANY (ARRAY['feedback'::text, 'behavior'::text, 'outcome'::text, 'app'::text, 'test'::text, 'custom'::text]))),
  CONSTRAINT "gateway_observability_events_metadata_dimensions_object_check" CHECK ((jsonb_typeof(metadata_dimensions) = 'object'::text)),
  CONSTRAINT "gateway_observability_events_name_check" CHECK (((length(btrim(event_name)) >= 1) AND (length(btrim(event_name)) <= 128))),
  CONSTRAINT "gateway_observability_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_observability_events_source_check" CHECK ((source = ANY (ARRAY['api'::text, 'user'::text, 'system'::text, 'import'::text, 'test'::text]))),
  CONSTRAINT "gateway_observability_events_target_check" CHECK (((request_id IS NOT NULL) OR (session_id IS NOT NULL) OR (preset_id IS NOT NULL) OR (test_run_id IS NOT NULL))),
  CONSTRAINT "gateway_observability_events_test_run_id_fkey" FOREIGN KEY (test_run_id) REFERENCES public.gateway_preset_test_runs(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_observability_events_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_observability_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_observability_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_observability_events_metadata_dimensions_idx ON public.gateway_observability_events USING gin (metadata_dimensions jsonb_path_ops);

CREATE INDEX gateway_observability_events_preset_id_idx ON public.gateway_observability_events USING btree (preset_id);

CREATE INDEX gateway_observability_events_preset_occurred_idx ON public.gateway_observability_events USING btree (workspace_id, preset_id, occurred_at DESC)
  WHERE (preset_id IS NOT NULL);

CREATE INDEX gateway_observability_events_request_occurred_idx ON public.gateway_observability_events USING btree (workspace_id, request_id, occurred_at DESC)
  WHERE (request_id IS NOT NULL);

CREATE INDEX gateway_observability_events_session_occurred_idx ON public.gateway_observability_events USING btree (workspace_id, session_id, occurred_at DESC)
  WHERE (session_id IS NOT NULL);

CREATE INDEX gateway_observability_events_test_run_id_idx ON public.gateway_observability_events USING btree (test_run_id);

CREATE INDEX gateway_observability_events_workspace_created_preset_idx ON public.gateway_observability_events USING btree (workspace_id, occurred_at DESC, preset_id)
  WHERE (preset_id IS NOT NULL);

CREATE INDEX gateway_observability_events_workspace_occurred_idx ON public.gateway_observability_events USING btree (workspace_id, occurred_at DESC);

CREATE POLICY "gateway_observability_events_all_service" ON "public"."gateway_observability_events"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "gateway_observability_events_select_workspace" ON "public"."gateway_observability_events"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_observability_events" TO "authenticated", "service_role";

COMMENT ON COLUMN "public"."gateway_observability_events"."metadata_dimensions" IS 'Bounded flat string map for indexed cohort and segment filters. Full arbitrary metadata remains in metadata.';

COMMENT ON TABLE "public"."gateway_observability_events" IS 'Custom production outcome and behavior events linked to gateway requests, sessions, presets, and preset test runs.';

REVOKE ALL ON TABLE "public"."gateway_observability_events" FROM "anon";
