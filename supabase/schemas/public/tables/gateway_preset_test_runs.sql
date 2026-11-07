CREATE TABLE "public"."gateway_preset_test_runs" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "preset_id"          uuid,
  "baseline_preset_id" uuid,
  "name"               text,
  "description"        text,
  "status"             text                     NOT NULL DEFAULT 'pending'::text,
  "dataset_name"       text,
  "config"             jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "summary"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "started_at"         timestamp with time zone,
  "completed_at"       timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_preset_test_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_preset_test_runs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "gateway_preset_test_runs_baseline_preset_id_fkey" FOREIGN KEY (baseline_preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_preset_test_runs_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_preset_test_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_preset_test_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_preset_test_runs_baseline_preset_id_idx ON public.gateway_preset_test_runs USING btree (baseline_preset_id);

CREATE INDEX gateway_preset_test_runs_preset_created_idx ON public.gateway_preset_test_runs USING btree (workspace_id, preset_id, created_at DESC)
  WHERE (preset_id IS NOT NULL);

CREATE INDEX gateway_preset_test_runs_preset_id_idx ON public.gateway_preset_test_runs USING btree (preset_id);

CREATE INDEX gateway_preset_test_runs_workspace_created_idx ON public.gateway_preset_test_runs USING btree (workspace_id, created_at DESC);

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_insert" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_update" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_no_oauth_client_delete" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "gateway_preset_test_runs_all_service" ON "public"."gateway_preset_test_runs"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "gateway_preset_test_runs_select_workspace" ON "public"."gateway_preset_test_runs"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."gateway_preset_test_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_preset_test_runs" TO "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_preset_test_runs" IS 'Preset comparison and evaluation run metadata for grouping feedback, events, and request outcomes.';

REVOKE ALL ON TABLE "public"."gateway_preset_test_runs" FROM "anon";
