CREATE TABLE "public"."work_items" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "number"              integer                  NOT NULL,
  "title"               text                     NOT NULL,
  "description"         text                     NOT NULL DEFAULT ''::text,
  "state"               text                     NOT NULL DEFAULT 'triage'::text,
  "priority"            smallint                 NOT NULL DEFAULT 0,
  "source"              text                     NOT NULL DEFAULT 'manual'::text,
  "labels"              text[]                   NOT NULL DEFAULT '{}'::text[],
  "assignee_user_id"    uuid,
  "assignee_agent"      text,
  "duplicate_of"        uuid,
  "error_group_id"      uuid,
  "github_repo"         text,
  "github_issue_number" integer,
  "github_issue_url"    text,
  "github_pr_url"       text,
  "triage_summary"      text,
  "due_at"              timestamp with time zone,
  "project_id"          uuid,
  "cycle_id"            uuid,
  "parent_id"           uuid,
  "estimate"            smallint,
  "sla_due_at"          timestamp with time zone,
  "last_activity_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "created_by"          uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "closed_at"           timestamp with time zone,
  CONSTRAINT "work_items_assignee_agent_check" CHECK (((assignee_agent IS NULL) OR (assignee_agent = ANY (ARRAY['triage'::text, 'engineer'::text, 'support'::text])))),
  CONSTRAINT "work_items_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_description_length_check" CHECK ((char_length(description) <= 100000)),
  CONSTRAINT "work_items_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES public.work_cycles(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_duplicate_of_fkey" FOREIGN KEY (duplicate_of) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_estimate_check" CHECK (((estimate IS NULL) OR ((estimate >= 0) AND (estimate <= 21)))),
  CONSTRAINT "work_items_github_repo_check" CHECK (((github_repo IS NULL) OR (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text))),
  CONSTRAINT "work_items_labels_check" CHECK ((cardinality(labels) <= 20)),
  CONSTRAINT "work_items_parent_id_check" CHECK (((parent_id IS NULL) OR (parent_id <> id))),
  CONSTRAINT "work_items_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_items_priority_check" CHECK (((priority >= 0) AND (priority <= 4))),
  CONSTRAINT "work_items_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_projects(id) ON DELETE SET NULL,
  CONSTRAINT "work_items_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'ask'::text, 'error'::text, 'github'::text, 'slack'::text, 'gateway'::text, 'agent'::text]))),
  CONSTRAINT "work_items_state_check" CHECK ((state = ANY (ARRAY['triage'::text, 'backlog'::text, 'todo'::text, 'in_progress'::text, 'in_review'::text, 'done'::text, 'cancelled'::text]))),
  CONSTRAINT "work_items_title_length_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 300))),
  CONSTRAINT "work_items_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "work_items_workspace_id_number_key" UNIQUE (workspace_id, number)
);

ALTER TABLE "public"."work_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_items_assignee_user_id_idx ON public.work_items USING btree (assignee_user_id)
  WHERE (assignee_user_id IS NOT NULL);

CREATE INDEX work_items_created_by_idx ON public.work_items USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_items_duplicate_of_idx ON public.work_items USING btree (duplicate_of)
  WHERE (duplicate_of IS NOT NULL);

CREATE INDEX work_items_error_group_id_idx ON public.work_items USING btree (error_group_id)
  WHERE (error_group_id IS NOT NULL);

CREATE UNIQUE INDEX work_items_github_issue_key ON public.work_items USING btree (workspace_id, github_repo, github_issue_number)
  WHERE (github_issue_number IS NOT NULL);

CREATE INDEX work_items_cycle_id_idx ON public.work_items USING btree (cycle_id)
  WHERE (cycle_id IS NOT NULL);

CREATE INDEX work_items_parent_id_idx ON public.work_items USING btree (parent_id)
  WHERE (parent_id IS NOT NULL);

CREATE INDEX work_items_project_id_idx ON public.work_items USING btree (project_id)
  WHERE (project_id IS NOT NULL);

CREATE INDEX work_items_open_activity_idx ON public.work_items USING btree (workspace_id, last_activity_at)
  WHERE (closed_at IS NULL);

CREATE INDEX work_items_workspace_state_updated_idx ON public.work_items USING btree (workspace_id, state, updated_at DESC);

CREATE INDEX work_items_workspace_updated_idx ON public.work_items USING btree (workspace_id, updated_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_items"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_items" IS 'Work items for the Phaseo work tracker: one row per issue, ask, error or request that people or agents work on. Numbered per workspace (public.create_work_item). Service role only; reached through web-api account routes after a membership check.';

COMMENT ON COLUMN "public"."work_items"."sla_due_at" IS 'When the item should be resolved under the workspace SLA for its priority (work_settings.sla_hours), set by web-api when the item is created or its priority changes. Null when no SLA applies.';

COMMENT ON COLUMN "public"."work_items"."last_activity_at" IS 'The last comment, state change, GitHub activity or agent run. Stalled-item follow-ups compare it with work_settings.stall_days.';

COMMENT ON COLUMN "public"."work_items"."priority" IS '0 no priority, 1 urgent, 2 high, 3 medium, 4 low.';

COMMENT ON COLUMN "public"."work_items"."assignee_agent" IS 'The agent identity working on the item, if any: triage (reads and sorts), engineer (works in repos and opens pull requests) or support (drafts replies a person sends).';

COMMENT ON COLUMN "public"."work_items"."triage_summary" IS 'The triage agent''s summary. Safe to copy into a GitHub issue: it never contains customer contact details.';

REVOKE ALL ON TABLE "public"."work_items" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_items" TO "service_role";

REVOKE ALL ON TABLE "public"."work_items" FROM "anon", "authenticated";
