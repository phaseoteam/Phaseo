-- Work tracker prototype (agent workspace): work items numbered per workspace, their timeline,
-- customers and customer requests (asks), public intake forms, error projects and error groups,
-- linked GitHub repositories (reported through the repository's GitHub Actions workflow), and
-- agent runs. Every table is service role only; web-api reaches them after a membership check.
-- * public.create_work_item: the next number and the created event in one transaction.
-- * public.record_work_error_event: counts one error against its group, creating or reopening it.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE TABLE "public"."work_projects" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "name"           text                     NOT NULL,
  "description"    text                     NOT NULL DEFAULT ''::text,
  "state"          text                     NOT NULL DEFAULT 'planned'::text,
  "lead_user_id"   uuid,
  "target_date"    date,
  "created_by"     uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_projects_description_length_check" CHECK ((char_length(description) <= 20000)),
  CONSTRAINT "work_projects_lead_user_id_fkey" FOREIGN KEY (lead_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_projects_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "work_projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_projects_state_check" CHECK ((state = ANY (ARRAY['planned'::text, 'active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT "work_projects_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_projects"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_projects_created_by_idx ON public.work_projects USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_projects_lead_user_id_idx ON public.work_projects USING btree (lead_user_id)
  WHERE (lead_user_id IS NOT NULL);

CREATE INDEX work_projects_workspace_state_idx ON public.work_projects USING btree (workspace_id, state, updated_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_projects"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_projects" IS 'Projects in the work tracker: a named body of work with a lead, a target date and a state. Work items belong to at most one project.';

REVOKE ALL ON TABLE "public"."work_projects" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_projects" TO "service_role";

REVOKE ALL ON TABLE "public"."work_projects" FROM "anon", "authenticated";

CREATE TABLE "public"."work_cycles" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "number"       integer                  NOT NULL,
  "name"         text,
  "starts_on"    date                     NOT NULL,
  "ends_on"      date                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_cycles_dates_check" CHECK ((ends_on > starts_on)),
  CONSTRAINT "work_cycles_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_cycles_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "work_cycles_workspace_id_number_key" UNIQUE (workspace_id, number)
);

ALTER TABLE "public"."work_cycles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_cycles_workspace_dates_idx ON public.work_cycles USING btree (workspace_id, starts_on DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_cycles"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_cycles" IS 'Time-boxed cycles (sprints), numbered per workspace. Work items are planned into at most one cycle.';

REVOKE ALL ON TABLE "public"."work_cycles" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_cycles" TO "service_role";

REVOKE ALL ON TABLE "public"."work_cycles" FROM "anon", "authenticated";

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

CREATE TABLE "public"."work_item_counters" (
  "workspace_id" uuid    NOT NULL,
  "last_number"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "work_item_counters_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "work_item_counters_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_counters"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_counters"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_counters" IS 'The last work item number given out per workspace. Written only by public.create_work_item.';

REVOKE ALL ON TABLE "public"."work_item_counters" FROM "service_role";

GRANT SELECT ON TABLE "public"."work_item_counters" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_counters" FROM "anon", "authenticated";

CREATE TABLE "public"."work_item_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "work_item_id"   uuid                     NOT NULL,
  "kind"           text                     NOT NULL,
  "author_kind"    text                     NOT NULL DEFAULT 'user'::text,
  "author_user_id" uuid,
  "author_name"    text,
  "body"           text                     NOT NULL DEFAULT ''::text,
  "data"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_item_events_author_kind_check" CHECK ((author_kind = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text, 'github'::text, 'customer'::text]))),
  CONSTRAINT "work_item_events_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_item_events_body_length_check" CHECK ((char_length(body) <= 100000)),
  CONSTRAINT "work_item_events_data_object_check" CHECK ((jsonb_typeof(data) = 'object'::text)),
  CONSTRAINT "work_item_events_kind_check" CHECK ((kind = ANY (ARRAY['created'::text, 'comment'::text, 'state'::text, 'priority'::text, 'assignee'::text, 'link'::text, 'triage'::text, 'agent_run'::text, 'customer_request'::text, 'github'::text, 'error'::text, 'project'::text, 'cycle'::text, 'parent'::text, 'relation'::text, 'estimate'::text, 'reply'::text, 'sla'::text, 'stalled'::text]))),
  CONSTRAINT "work_item_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_item_events_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_item_events_author_user_id_idx ON public.work_item_events USING btree (author_user_id)
  WHERE (author_user_id IS NOT NULL);

CREATE INDEX work_item_events_workspace_id_idx ON public.work_item_events USING btree (workspace_id);

CREATE INDEX work_item_events_item_created_idx ON public.work_item_events USING btree (work_item_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_events" IS 'The timeline of a work item: comments, state and priority changes, links, triage results, agent runs, customer requests and GitHub activity. Append-only in practice.';

REVOKE ALL ON TABLE "public"."work_item_events" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."work_item_events" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_events" FROM "anon", "authenticated";

CREATE TABLE "public"."work_customers" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "domain"       text,
  "external_ref" text,
  "tier"         text,
  "notes"        text                     NOT NULL DEFAULT ''::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_customers_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
  CONSTRAINT "work_customers_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_customers_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_customers"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX work_customers_workspace_domain_key ON public.work_customers USING btree (workspace_id, lower(domain))
  WHERE (domain IS NOT NULL);

CREATE INDEX work_customers_workspace_name_idx ON public.work_customers USING btree (workspace_id, name);

CREATE POLICY "deny_direct_client_access" ON "public"."work_customers"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_customers" IS 'A workspace''s own customers (companies or people), so requests can be attributed and demand counted. Private: never copied into GitHub.';

REVOKE ALL ON TABLE "public"."work_customers" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_customers" TO "service_role";

REVOKE ALL ON TABLE "public"."work_customers" FROM "anon", "authenticated";

CREATE TABLE "public"."work_intake_forms" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "name"          text                     NOT NULL,
  "token_hash"    text                     NOT NULL,
  "token_prefix"  text                     NOT NULL,
  "enabled"       boolean                  NOT NULL DEFAULT true,
  "auto_triage"   boolean                  NOT NULL DEFAULT true,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at"  timestamp with time zone,
  CONSTRAINT "work_intake_forms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_intake_forms_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "work_intake_forms_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_intake_forms_token_hash_key" UNIQUE (token_hash),
  CONSTRAINT "work_intake_forms_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_intake_forms"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_intake_forms_created_by_idx ON public.work_intake_forms USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_intake_forms_workspace_id_idx ON public.work_intake_forms USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_intake_forms"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_intake_forms" IS 'Public intake endpoints (web forms, email forwarders, support widgets) that create asks. The token is shown once; only its SHA-256 hash is stored.';

REVOKE ALL ON TABLE "public"."work_intake_forms" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_intake_forms" TO "service_role";

REVOKE ALL ON TABLE "public"."work_intake_forms" FROM "anon", "authenticated";

CREATE TABLE "public"."work_customer_requests" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "customer_id"    uuid,
  "work_item_id"   uuid,
  "intake_form_id" uuid,
  "source"         text                     NOT NULL DEFAULT 'manual'::text,
  "status"         text                     NOT NULL DEFAULT 'new'::text,
  "contact_name"   text,
  "contact_email"  text,
  "subject"        text,
  "body"           text                     NOT NULL,
  "metadata"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_by"     uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_customer_requests_body_length_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 50000))),
  CONSTRAINT "work_customer_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.work_customers(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_intake_form_id_fkey" FOREIGN KEY (intake_form_id) REFERENCES public.work_intake_forms(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_metadata_object_check" CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  CONSTRAINT "work_customer_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_customer_requests_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'form'::text, 'email'::text, 'slack'::text, 'api'::text]))),
  CONSTRAINT "work_customer_requests_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'linked'::text, 'dismissed'::text]))),
  CONSTRAINT "work_customer_requests_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_customer_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_customer_requests_created_by_idx ON public.work_customer_requests USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_customer_requests_customer_id_idx ON public.work_customer_requests USING btree (customer_id)
  WHERE (customer_id IS NOT NULL);

CREATE INDEX work_customer_requests_intake_form_id_idx ON public.work_customer_requests USING btree (intake_form_id)
  WHERE (intake_form_id IS NOT NULL);

CREATE INDEX work_customer_requests_work_item_id_idx ON public.work_customer_requests USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_customer_requests_workspace_status_idx ON public.work_customer_requests USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_customer_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_customer_requests" IS 'Asks and customer feedback, in the customer''s own words, attached to a work item as the record of demand. Private: the body and contact details are never copied into GitHub or sent to an agent that can write outside Phaseo.';

REVOKE ALL ON TABLE "public"."work_customer_requests" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_customer_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."work_customer_requests" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_projects" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "key_hash"     text                     NOT NULL,
  "key_prefix"   text                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT true,
  "auto_triage"  boolean                  NOT NULL DEFAULT true,
  "github_repo"  text,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_event_at" timestamp with time zone,
  CONSTRAINT "work_error_projects_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_error_projects_github_repo_check" CHECK (((github_repo IS NULL) OR (github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text))),
  CONSTRAINT "work_error_projects_key_hash_key" UNIQUE (key_hash),
  CONSTRAINT "work_error_projects_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "work_error_projects_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_projects_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_projects"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_error_projects_created_by_idx ON public.work_error_projects USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_error_projects_workspace_id_idx ON public.work_error_projects USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_projects"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_projects" IS 'An app that reports errors to Phaseo. The ingest key is public by design (it ships in browser code), so it can only add errors; only its SHA-256 hash is stored.';

REVOKE ALL ON TABLE "public"."work_error_projects" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_projects" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_projects" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_groups" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "project_id"     uuid                     NOT NULL,
  "fingerprint"    text                     NOT NULL,
  "exception_type" text                     NOT NULL,
  "message"        text                     NOT NULL DEFAULT ''::text,
  "culprit"        text,
  "status"         text                     NOT NULL DEFAULT 'open'::text,
  "event_count"    bigint                   NOT NULL DEFAULT 0,
  "first_seen_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_release"   text,
  "last_environment" text,
  "last_event"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "work_item_id"   uuid,
  "resolved_at"    timestamp with time zone,
  "spike_alerted_at" timestamp with time zone,
  CONSTRAINT "work_error_groups_last_event_object_check" CHECK ((jsonb_typeof(last_event) = 'object'::text)),
  CONSTRAINT "work_error_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_groups_project_fingerprint_key" UNIQUE (project_id, fingerprint),
  CONSTRAINT "work_error_groups_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_groups_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'ignored'::text]))),
  CONSTRAINT "work_error_groups_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_error_groups_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_groups"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_error_groups_work_item_id_idx ON public.work_error_groups USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_error_groups_workspace_status_seen_idx ON public.work_error_groups USING btree (workspace_id, status, last_seen_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_groups"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_groups" IS 'Errors grouped by fingerprint (exception type plus top in-app frames, after source maps). One small row per group with counts and the latest sample event; raw events are not stored here. Written by public.record_work_error_event.';

REVOKE ALL ON TABLE "public"."work_error_groups" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_groups" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_groups" FROM "anon", "authenticated";

CREATE TABLE "public"."work_github_repos" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "repo"              text                     NOT NULL,
  "bridge_token_hash" text                     NOT NULL,
  "bridge_token_prefix" text                   NOT NULL,
  "github_token_ciphertext" text,
  "sync_issues"       boolean                  NOT NULL DEFAULT true,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "last_event_at"     timestamp with time zone,
  CONSTRAINT "work_github_repos_bridge_token_hash_key" UNIQUE (bridge_token_hash),
  CONSTRAINT "work_github_repos_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_github_repos_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_github_repos_repo_check" CHECK ((repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text)),
  CONSTRAINT "work_github_repos_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "work_github_repos_workspace_repo_key" UNIQUE (workspace_id, repo)
);

ALTER TABLE "public"."work_github_repos"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_github_repos_created_by_idx ON public.work_github_repos USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_github_repos"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_github_repos" IS 'GitHub repositories linked to the work tracker. The repository''s Phaseo workflow (GitHub Actions) reports issue, comment and pull request events with the bridge token, whose SHA-256 hash is stored. github_token_ciphertext is an optional encrypted fine-grained token used to create issues from Phaseo.';

REVOKE ALL ON TABLE "public"."work_github_repos" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_github_repos" TO "service_role";

REVOKE ALL ON TABLE "public"."work_github_repos" FROM "anon", "authenticated";

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

CREATE TABLE "public"."work_error_group_hours" (
  "group_id"     uuid                     NOT NULL,
  "hour"         timestamp with time zone NOT NULL,
  "event_count"  integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "work_error_group_hours_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.work_error_groups(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_group_hours_pkey" PRIMARY KEY (group_id, hour)
);

ALTER TABLE "public"."work_error_group_hours"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_group_hours"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_group_hours" IS 'Events per error group per UTC hour, for the error chart and spike detection. Written by public.record_work_error_event; rows older than 30 days can be pruned.';

REVOKE ALL ON TABLE "public"."work_error_group_hours" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."work_error_group_hours" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_group_hours" FROM "anon", "authenticated";

CREATE TABLE "public"."work_item_relations" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"    uuid                     NOT NULL,
  "item_id"         uuid                     NOT NULL,
  "related_item_id" uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "created_by"      uuid,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_item_relations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_item_relations_distinct_check" CHECK ((item_id <> related_item_id)),
  CONSTRAINT "work_item_relations_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_relations_kind_check" CHECK ((kind = ANY (ARRAY['blocks'::text, 'related'::text]))),
  CONSTRAINT "work_item_relations_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_item_relations_related_item_id_fkey" FOREIGN KEY (related_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_item_relations_unique_key" UNIQUE (item_id, related_item_id, kind),
  CONSTRAINT "work_item_relations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_relations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_item_relations_created_by_idx ON public.work_item_relations USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_item_relations_related_item_id_idx ON public.work_item_relations USING btree (related_item_id);

CREATE INDEX work_item_relations_workspace_id_idx ON public.work_item_relations USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_relations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_relations" IS 'Links between work items: item_id blocks related_item_id, or the two are related (stored once, read both ways).';

REVOKE ALL ON TABLE "public"."work_item_relations" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_item_relations" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_relations" FROM "anon", "authenticated";

CREATE TABLE "public"."work_views" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "owner_user_id" uuid,
  "name"          text                     NOT NULL,
  "filters"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "layout"        text                     NOT NULL DEFAULT 'list'::text,
  "position"      integer                  NOT NULL DEFAULT 0,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_views_filters_object_check" CHECK ((jsonb_typeof(filters) = 'object'::text)),
  CONSTRAINT "work_views_layout_check" CHECK ((layout = ANY (ARRAY['list'::text, 'board'::text]))),
  CONSTRAINT "work_views_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
  CONSTRAINT "work_views_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_views_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_views_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_views"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_views_owner_user_id_idx ON public.work_views USING btree (owner_user_id)
  WHERE (owner_user_id IS NOT NULL);

CREATE INDEX work_views_workspace_position_idx ON public.work_views USING btree (workspace_id, position);

CREATE POLICY "deny_direct_client_access" ON "public"."work_views"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_views" IS 'Saved views of work items: filters (state, source, assignee, label, project, cycle, priority, text) and a list or board layout. owner_user_id null means shared with the workspace.';

REVOKE ALL ON TABLE "public"."work_views" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_views" TO "service_role";

REVOKE ALL ON TABLE "public"."work_views" FROM "anon", "authenticated";

CREATE TABLE "public"."work_settings" (
  "workspace_id"           uuid                     NOT NULL,
  "sla_hours"              jsonb                    NOT NULL DEFAULT '{"1": 4, "2": 24, "3": 72, "4": 168}'::jsonb,
  "stall_days"             integer                  NOT NULL DEFAULT 7,
  "ambient_enabled"        boolean                  NOT NULL DEFAULT false,
  "support_drafts_enabled" boolean                  NOT NULL DEFAULT true,
  "updated_by"             uuid,
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_settings_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "work_settings_sla_hours_object_check" CHECK ((jsonb_typeof(sla_hours) = 'object'::text)),
  CONSTRAINT "work_settings_stall_days_check" CHECK (((stall_days >= 1) AND (stall_days <= 90))),
  CONSTRAINT "work_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_settings_updated_by_idx ON public.work_settings USING btree (updated_by)
  WHERE (updated_by IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_settings" IS 'Work tracker settings per workspace: SLA hours by priority (keys "1" to "4"), the days without activity after which an open item counts as stalled, whether the ambient agent follows up on stalled items (off by default), and whether the support agent drafts replies to customers when their item is done. A missing row means the defaults.';

REVOKE ALL ON TABLE "public"."work_settings" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."work_settings" FROM "anon", "authenticated";

CREATE TABLE "public"."work_subscriptions" (
  "work_item_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "reason"       text                     NOT NULL DEFAULT 'manual'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_subscriptions_pkey" PRIMARY KEY (work_item_id, user_id),
  CONSTRAINT "work_subscriptions_reason_check" CHECK ((reason = ANY (ARRAY['creator'::text, 'assignee'::text, 'commenter'::text, 'mention'::text, 'manual'::text]))),
  CONSTRAINT "work_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_subscriptions_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_subscriptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_subscriptions_user_id_idx ON public.work_subscriptions USING btree (user_id);

CREATE INDEX work_subscriptions_workspace_id_idx ON public.work_subscriptions USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_subscriptions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_subscriptions" IS 'People following a work item, who get its notifications. Added automatically for the creator, assignee, commenters and people mentioned; removable by unsubscribing.';

REVOKE ALL ON TABLE "public"."work_subscriptions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."work_subscriptions" FROM "anon", "authenticated";

CREATE TABLE "public"."work_notifications" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "work_item_id" uuid,
  "kind"         text                     NOT NULL,
  "actor_name"   text,
  "body"         text                     NOT NULL DEFAULT ''::text,
  "read_at"      timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_notifications_body_length_check" CHECK ((char_length(body) <= 2000)),
  CONSTRAINT "work_notifications_kind_check" CHECK ((kind = ANY (ARRAY['assigned'::text, 'comment'::text, 'mention'::text, 'state'::text, 'sla'::text, 'stalled'::text, 'error_spike'::text, 'agent'::text, 'reply_draft'::text]))),
  CONSTRAINT "work_notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_notifications_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_notifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_notifications_user_unread_idx ON public.work_notifications USING btree (user_id, workspace_id, created_at DESC)
  WHERE (read_at IS NULL);

CREATE INDEX work_notifications_user_created_idx ON public.work_notifications USING btree (user_id, workspace_id, created_at DESC);

CREATE INDEX work_notifications_work_item_id_idx ON public.work_notifications USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_notifications_workspace_id_idx ON public.work_notifications USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_notifications"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_notifications" IS 'A person''s work inbox: assignments, comments, mentions, state changes, SLA warnings, stalled items, error spikes, agent results and reply drafts waiting for review.';

REVOKE ALL ON TABLE "public"."work_notifications" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_notifications" TO "service_role";

REVOKE ALL ON TABLE "public"."work_notifications" FROM "anon", "authenticated";

CREATE TABLE "public"."work_reply_drafts" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "work_item_id" uuid                     NOT NULL,
  "request_id"   uuid                     NOT NULL,
  "subject"      text                     NOT NULL DEFAULT ''::text,
  "body"         text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'draft'::text,
  "model"        text,
  "cost_nanos"   bigint                   NOT NULL DEFAULT 0,
  "sent_to"      text,
  "sent_by"      uuid,
  "sent_at"      timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_reply_drafts_body_length_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 20000))),
  CONSTRAINT "work_reply_drafts_cost_nanos_check" CHECK ((cost_nanos >= 0)),
  CONSTRAINT "work_reply_drafts_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_reply_drafts_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.work_customer_requests(id) ON DELETE CASCADE,
  CONSTRAINT "work_reply_drafts_sent_by_fkey" FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_reply_drafts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'discarded'::text]))),
  CONSTRAINT "work_reply_drafts_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_reply_drafts_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_reply_drafts"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX work_reply_drafts_open_request_key ON public.work_reply_drafts USING btree (request_id)
  WHERE (status = 'draft'::text);

CREATE INDEX work_reply_drafts_sent_by_idx ON public.work_reply_drafts USING btree (sent_by)
  WHERE (sent_by IS NOT NULL);

CREATE INDEX work_reply_drafts_work_item_id_idx ON public.work_reply_drafts USING btree (work_item_id);

CREATE INDEX work_reply_drafts_workspace_status_idx ON public.work_reply_drafts USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_reply_drafts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_reply_drafts" IS 'Replies to customers written by the support agent when their item is done. A person reviews, edits and sends each one; nothing is sent automatically. At most one open draft per request.';

REVOKE ALL ON TABLE "public"."work_reply_drafts" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_reply_drafts" TO "service_role";

REVOKE ALL ON TABLE "public"."work_reply_drafts" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.create_work_item (
  p_workspace_id uuid,
  p_title        text,
  p_description  text DEFAULT ''::text,
  p_state        text DEFAULT 'triage'::text,
  p_priority     smallint DEFAULT 0,
  p_source       text DEFAULT 'manual'::text,
  p_created_by   uuid DEFAULT NULL::uuid,
  p_author_kind  text DEFAULT 'user'::text,
  p_fields       jsonb DEFAULT '{}'::jsonb
)
  RETURNS public.work_items
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Creates a work item with the workspace's next number and its "created" timeline event, in one
-- transaction. p_fields may set labels (text array), assignee_user_id, assignee_agent,
-- error_group_id, github_repo, github_issue_number, github_issue_url, due_at, project_id, cycle_id,
-- parent_id, estimate and sla_due_at; other keys are
-- ignored. Numbers are never reused, even when items are deleted.
declare
  v_number integer;
  v_item public.work_items;
begin
  insert into public.work_item_counters as counter (workspace_id, last_number)
  values (p_workspace_id, 1)
  on conflict (workspace_id) do update set last_number = counter.last_number + 1
  returning counter.last_number into v_number;

  insert into public.work_items (
    workspace_id, number, title, description, state, priority, source, labels,
    assignee_user_id, assignee_agent, error_group_id, github_repo, github_issue_number,
    github_issue_url, due_at, project_id, cycle_id, parent_id, estimate, sla_due_at, created_by
  ) values (
    p_workspace_id, v_number, p_title, coalesce(p_description, ''), coalesce(p_state, 'triage'),
    coalesce(p_priority, 0), coalesce(p_source, 'manual'),
    coalesce(array(select jsonb_array_elements_text(p_fields -> 'labels')), '{}'::text[]),
    nullif(p_fields ->> 'assignee_user_id', '')::uuid,
    nullif(p_fields ->> 'assignee_agent', ''),
    nullif(p_fields ->> 'error_group_id', '')::uuid,
    nullif(p_fields ->> 'github_repo', ''),
    nullif(p_fields ->> 'github_issue_number', '')::integer,
    nullif(p_fields ->> 'github_issue_url', ''),
    nullif(p_fields ->> 'due_at', '')::timestamp with time zone,
    nullif(p_fields ->> 'project_id', '')::uuid,
    nullif(p_fields ->> 'cycle_id', '')::uuid,
    nullif(p_fields ->> 'parent_id', '')::uuid,
    nullif(p_fields ->> 'estimate', '')::smallint,
    nullif(p_fields ->> 'sla_due_at', '')::timestamp with time zone,
    p_created_by
  )
  returning * into v_item;

  insert into public.work_item_events (workspace_id, work_item_id, kind, author_kind, author_user_id, data)
  values (p_workspace_id, v_item.id, 'created', coalesce(p_author_kind, 'user'), p_created_by,
    jsonb_build_object('source', v_item.source, 'state', v_item.state));

  return v_item;
end;
$function$;

COMMENT ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) IS 'Creates a numbered work item and its created event. Service role only.';

REVOKE ALL ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.create_work_item(uuid, text, text, text, smallint, text, uuid, text, jsonb) TO "service_role";

CREATE OR REPLACE FUNCTION public.record_work_error_event (
  p_project_id     uuid,
  p_fingerprint    text,
  p_exception_type text,
  p_message        text,
  p_culprit        text DEFAULT NULL::text,
  p_release        text DEFAULT NULL::text,
  p_environment    text DEFAULT NULL::text,
  p_event          jsonb DEFAULT '{}'::jsonb,
  p_seen_at        timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Counts one error event against its group, creating the group on first sight. A resolved group
-- that sees a new event is reopened; an ignored group stays ignored. Returns
-- { group_id, workspace_id, is_new, reopened, status, work_item_id, event_count, auto_triage,
-- github_repo, hour_count, spiking }, or null when the
-- project is unknown or disabled. The caller decides whether a new or reopened group gets a work item.
declare
  v_project public.work_error_projects;
  v_group public.work_error_groups;
  v_previous_status text;
  v_is_new boolean;
  v_hour_count integer;
  v_baseline numeric;
  v_spiking boolean;
begin
  select * into v_project from public.work_error_projects project
  where project.id = p_project_id and project.enabled;
  if v_project.id is null then
    return null;
  end if;

  select error_group.status into v_previous_status from public.work_error_groups error_group
  where error_group.project_id = p_project_id and error_group.fingerprint = p_fingerprint;
  v_is_new := v_previous_status is null;

  insert into public.work_error_groups as error_group (
    workspace_id, project_id, fingerprint, exception_type, message, culprit, status, event_count,
    first_seen_at, last_seen_at, last_release, last_environment, last_event
  ) values (
    v_project.workspace_id, p_project_id, p_fingerprint, left(p_exception_type, 200), left(coalesce(p_message, ''), 2000),
    left(p_culprit, 500), 'open', 1, p_seen_at, p_seen_at, left(p_release, 200), left(p_environment, 100),
    coalesce(p_event, '{}'::jsonb)
  )
  on conflict (project_id, fingerprint) do update set
    event_count = error_group.event_count + 1,
    last_seen_at = greatest(error_group.last_seen_at, excluded.last_seen_at),
    message = excluded.message,
    culprit = coalesce(excluded.culprit, error_group.culprit),
    last_release = coalesce(excluded.last_release, error_group.last_release),
    last_environment = coalesce(excluded.last_environment, error_group.last_environment),
    last_event = excluded.last_event,
    status = case when error_group.status = 'resolved' then 'open' else error_group.status end,
    resolved_at = case when error_group.status = 'resolved' then null else error_group.resolved_at end
  returning * into v_group;

  insert into public.work_error_group_hours as bucket (group_id, hour, event_count)
  values (v_group.id, date_trunc('hour', p_seen_at), 1)
  on conflict (group_id, hour) do update set event_count = bucket.event_count + 1
  returning bucket.event_count into v_hour_count;

  -- A spike: at least 10 events this hour and five times the average of the previous 24 hours
  -- (hours without events count as zero). Alerted at most once every 6 hours per group.
  select coalesce(sum(bucket.event_count), 0)::numeric / 24 into v_baseline
  from public.work_error_group_hours bucket
  where bucket.group_id = v_group.id
    and bucket.hour >= date_trunc('hour', p_seen_at) - interval '24 hours'
    and bucket.hour < date_trunc('hour', p_seen_at);
  v_spiking := v_group.status <> 'ignored' and v_hour_count >= 10 and v_hour_count >= 5 * v_baseline
    and (v_group.spike_alerted_at is null or v_group.spike_alerted_at < p_seen_at - interval '6 hours');
  if v_spiking then
    update public.work_error_groups error_group set spike_alerted_at = p_seen_at where error_group.id = v_group.id;
  end if;

  update public.work_error_projects project set last_event_at = p_seen_at
  where project.id = p_project_id and (project.last_event_at is null or project.last_event_at < p_seen_at - interval '1 minute');

  return jsonb_build_object(
    'group_id', v_group.id,
    'workspace_id', v_group.workspace_id,
    'is_new', v_is_new,
    'reopened', coalesce(v_previous_status = 'resolved', false),
    'status', v_group.status,
    'work_item_id', v_group.work_item_id,
    'event_count', v_group.event_count,
    'auto_triage', v_project.auto_triage,
    'github_repo', v_project.github_repo,
    'hour_count', v_hour_count,
    'spiking', v_spiking
  );
end;
$function$;

COMMENT ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) IS 'Counts one error event against its group (creating or reopening it). Service role only; called by the web-api error ingest route.';

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.work_insights (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The work tracker's insights for one workspace and period, aggregated here so callers never add
-- up rows: items created and closed per UTC day (created split by source), open items by state and
-- by priority, open items past their SLA, stalled open items (no activity for the workspace's
-- stall_days), the median and 90th percentile hours from creation to close, and agent runs by agent
-- with their cost. Days without items are omitted.
with settings as (
  select coalesce((select stall_days from public.work_settings where workspace_id = p_workspace_id), 7) as stall_days
),
created as (
  select date_trunc('day', item.created_at at time zone 'UTC')::date as day, item.source, count(*)::integer as items
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.created_at >= p_from and item.created_at < p_to
  group by 1, 2
),
closed as (
  select date_trunc('day', item.closed_at at time zone 'UTC')::date as day, count(*)::integer as items,
    count(*) filter (where item.state = 'done')::integer as done
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.closed_at >= p_from and item.closed_at < p_to
  group by 1
),
open_items as (
  select item.state, item.priority, item.sla_due_at, item.last_activity_at
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.closed_at is null and item.state not in ('done', 'cancelled')
),
durations as (
  select extract(epoch from (item.closed_at - item.created_at)) / 3600 as hours
  from public.work_items item
  where item.workspace_id = p_workspace_id and item.state = 'done' and item.closed_at >= p_from and item.closed_at < p_to
),
runs as (
  select run.agent, count(*)::integer as runs, count(*) filter (where run.status = 'succeeded')::integer as succeeded,
    coalesce(sum(run.cost_nanos), 0)::bigint as cost_nanos
  from public.work_agent_runs run
  where run.workspace_id = p_workspace_id and run.created_at >= p_from and run.created_at < p_to
  group by 1
)
select jsonb_build_object(
  'created', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'source', source, 'items', items) order by day, source) from created), '[]'::jsonb),
  'closed', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'items', items, 'done', done) order by day) from closed), '[]'::jsonb),
  'open_by_state', coalesce((select jsonb_object_agg(state, items) from (select state, count(*)::integer as items from open_items group by 1) by_state), '{}'::jsonb),
  'open_by_priority', coalesce((select jsonb_object_agg(priority::text, items) from (select priority, count(*)::integer as items from open_items group by 1) by_priority), '{}'::jsonb),
  'open_past_sla', (select count(*)::integer from open_items where sla_due_at is not null and sla_due_at < now()),
  'open_stalled', (select count(*)::integer from open_items, settings where last_activity_at < now() - make_interval(days => settings.stall_days)),
  'close_hours_p50', (select round((percentile_cont(0.5) within group (order by hours))::numeric, 1) from durations),
  'close_hours_p90', (select round((percentile_cont(0.9) within group (order by hours))::numeric, 1) from durations),
  'runs', coalesce((select jsonb_agg(jsonb_build_object('agent', agent, 'runs', runs, 'succeeded', succeeded, 'cost_nanos', cost_nanos) order by agent) from runs), '[]'::jsonb)
);
$function$;

COMMENT ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) IS 'Aggregated work tracker insights for a workspace and period. Service role only; called by the web-api insights route after a membership check.';

REVOKE ALL ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_insights(uuid, timestamp with time zone, timestamp with time zone) TO "service_role";
