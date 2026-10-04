CREATE TABLE "public"."gateway_preset_test_run_items" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "test_run_id"     uuid                     NOT NULL,
  "preset_id"       uuid,
  "request_id"      text,
  "input"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "expected_output" jsonb,
  "actual_output"   jsonb,
  "metrics"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"          text                     NOT NULL DEFAULT 'pending'::text,
  "feedback_id"     uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_preset_test_run_items_feedback_id_fkey" FOREIGN KEY (feedback_id) REFERENCES public.gateway_feedback(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_preset_test_run_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_preset_test_run_items_status_check"
    CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'passed'::text, 'failed'::text, 'error'::text, 'skipped'::text]))),
  CONSTRAINT "gateway_preset_test_run_items_test_run_id_fkey" FOREIGN KEY (test_run_id) REFERENCES public.gateway_preset_test_runs(id) ON DELETE CASCADE,
  CONSTRAINT "gateway_preset_test_run_items_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_preset_test_run_items_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_preset_test_run_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_preset_test_run_items_feedback_id_idx ON public.gateway_preset_test_run_items USING btree (feedback_id);

CREATE INDEX gateway_preset_test_run_items_preset_id_idx ON public.gateway_preset_test_run_items USING btree (preset_id);

CREATE INDEX gateway_preset_test_run_items_run_created_idx ON public.gateway_preset_test_run_items USING btree (workspace_id, test_run_id, created_at DESC);

CREATE INDEX gateway_preset_test_run_items_test_run_id_idx ON public.gateway_preset_test_run_items USING btree (test_run_id);

CREATE POLICY "gateway_preset_test_run_items_all_service" ON "public"."gateway_preset_test_run_items"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "gateway_preset_test_run_items_select_workspace" ON "public"."gateway_preset_test_run_items"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_preset_test_run_items" TO "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."gateway_preset_test_run_items" FROM "anon";
