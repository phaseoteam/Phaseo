CREATE TABLE "public"."work_agent_runs" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "work_item_id" uuid                     NOT NULL,
  "agent"        text                     NOT NULL,
  "runner"       text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'queued'::text,
  "model"        text,
  "cost_nanos"   bigint                   NOT NULL DEFAULT 0,
  "summary"      text,
  "output"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "external_url" text,
  "requested_by" uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "started_at"   timestamp with time zone,
  "finished_at"  timestamp with time zone,
  CONSTRAINT "work_agent_runs_agent_check" CHECK ((agent = ANY (ARRAY['triage'::text, 'engineer'::text, 'support'::text]))),
  CONSTRAINT "work_agent_runs_cost_nanos_check" CHECK ((cost_nanos >= 0)),
  CONSTRAINT "work_agent_runs_output_object_check" CHECK ((jsonb_typeof(output) = 'object'::text)),
  CONSTRAINT "work_agent_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_agent_runs_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_agent_runs_runner_check" CHECK ((runner = ANY (ARRAY['gateway'::text, 'github_actions'::text, 'desktop'::text]))),
  CONSTRAINT "work_agent_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "work_agent_runs_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_agent_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_agent_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_agent_runs_item_created_idx ON public.work_agent_runs USING btree (work_item_id, created_at DESC);

CREATE INDEX work_agent_runs_requested_by_idx ON public.work_agent_runs USING btree (requested_by)
  WHERE (requested_by IS NOT NULL);

CREATE INDEX work_agent_runs_workspace_created_idx ON public.work_agent_runs USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_agent_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_agent_runs" IS 'Agent runs on work items: who ran (triage, engineer, support), where (the gateway from web-api, the repository''s GitHub Actions, or a desktop), the outcome, the cost and a link to the run.';

REVOKE ALL ON TABLE "public"."work_agent_runs" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_agent_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."work_agent_runs" FROM "anon", "authenticated";
