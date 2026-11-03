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
  "start_date"     date,
  "initiative_id"  uuid,
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

COMMENT ON TABLE "public"."work_cycles" IS 'Time-boxed cycles (sprints), numbered per workspace, from starts_on to ends_on (both days included). Work items are planned into at most one cycle.';

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
  "milestone_id"     uuid,
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
  CONSTRAINT "work_item_events_kind_check" CHECK ((kind = ANY (ARRAY['created'::text, 'comment'::text, 'state'::text, 'priority'::text, 'assignee'::text, 'link'::text, 'triage'::text, 'agent_run'::text, 'customer_request'::text, 'github'::text, 'error'::text, 'project'::text, 'cycle'::text, 'parent'::text, 'relation'::text, 'estimate'::text, 'reply'::text, 'sla'::text, 'stalled'::text, 'attachment'::text, 'milestone'::text]))),
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

CREATE INDEX work_item_events_workspace_created_idx ON public.work_item_events USING btree (workspace_id, created_at, id);

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
  "email_alias"  text,
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

CREATE UNIQUE INDEX work_intake_forms_email_alias_key ON public.work_intake_forms USING btree (email_alias)
  WHERE (email_alias IS NOT NULL);

ALTER TABLE "public"."work_intake_forms"
  ADD CONSTRAINT "work_intake_forms_email_alias_check" CHECK (((email_alias IS NULL) OR (email_alias ~ '^[a-z0-9]{16,32}$'::text)));

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
  "upload_key_hash"   text,
  "upload_key_prefix" text,
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

CREATE UNIQUE INDEX work_error_projects_upload_key_hash_key ON public.work_error_projects USING btree (upload_key_hash)
  WHERE (upload_key_hash IS NOT NULL);

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
  "users_count"    bigint                   NOT NULL DEFAULT 0,
  "first_release"  text,
  "resolved_in_release" text,
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
  "emailed_at"   timestamp with time zone,
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

CREATE INDEX work_notifications_email_due_idx ON public.work_notifications USING btree (created_at)
  WHERE ((read_at IS NULL) AND (emailed_at IS NULL));

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

CREATE TABLE "public"."work_cycle_days" (
  "cycle_id"     uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "day"          date                     NOT NULL,
  "scope"        numeric                  NOT NULL DEFAULT 0,
  "completed"    numeric                  NOT NULL DEFAULT 0,
  "item_count"   integer                  NOT NULL DEFAULT 0,
  "done_count"   integer                  NOT NULL DEFAULT 0,
  "recorded_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_cycle_days_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES public.work_cycles(id) ON DELETE CASCADE,
  CONSTRAINT "work_cycle_days_pkey" PRIMARY KEY (cycle_id, day)
);

ALTER TABLE "public"."work_cycle_days"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_cycle_days"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_cycle_days" IS 'A work cycle''s totals at the end of each UTC day it ran (the latest snapshot that day), for its burn-up chart. Written by public.snapshot_work_cycle_days.';

REVOKE ALL ON TABLE "public"."work_cycle_days" FROM "service_role";

GRANT SELECT ON TABLE "public"."work_cycle_days" TO "service_role";

REVOKE ALL ON TABLE "public"."work_cycle_days" FROM "anon", "authenticated";

CREATE TABLE "public"."work_member_settings" (
  "workspace_id"        uuid                     NOT NULL,
  "user_id"             uuid                     NOT NULL,
  "email_notifications" text                     NOT NULL DEFAULT 'digest'::text,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_member_settings_email_notifications_check" CHECK ((email_notifications = ANY (ARRAY['off'::text, 'digest'::text]))),
  CONSTRAINT "work_member_settings_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "work_member_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_member_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_member_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_member_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_member_settings" IS 'A member''s own work tracker settings in a workspace. A missing row means the defaults (email_notifications = digest).';

REVOKE ALL ON TABLE "public"."work_member_settings" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_member_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."work_member_settings" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_group_users" (
  "group_id"      uuid                     NOT NULL,
  "user_hash"     text                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_error_group_users_hash_check" CHECK ((char_length(user_hash) = 32)),
  CONSTRAINT "work_error_group_users_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.work_error_groups(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_group_users_pkey" PRIMARY KEY (group_id, user_hash)
);

ALTER TABLE "public"."work_error_group_users"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_group_users"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_group_users" IS 'People an error group affected, as a hash of the app''s user id salted with the project id (never the id itself). Written by public.record_work_error_event.';

REVOKE ALL ON TABLE "public"."work_error_group_users" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."work_error_group_users" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_group_users" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_releases" (
  "project_id"    uuid                     NOT NULL,
  "version"       text                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "event_count"   bigint                   NOT NULL DEFAULT 0,
  "new_groups"    integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "work_error_releases_version_length_check" CHECK ((char_length(version) <= 200)),
  CONSTRAINT "work_error_releases_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_releases_pkey" PRIMARY KEY (project_id, version)
);

ALTER TABLE "public"."work_error_releases"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_releases"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_releases" IS 'Releases an error project has reported: events and new error groups per release. Written by public.record_work_error_event.';

REVOKE ALL ON TABLE "public"."work_error_releases" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."work_error_releases" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_releases" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_rules" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     uuid                     NOT NULL,
  "project_id"       uuid                     NOT NULL,
  "action"           text                     NOT NULL,
  "field"            text                     NOT NULL,
  "pattern"          text                     NOT NULL,
  "assignee_user_id" uuid,
  "enabled"          boolean                  NOT NULL DEFAULT true,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_error_rules_action_check" CHECK ((action = ANY (ARRAY['ignore'::text, 'assign'::text]))),
  CONSTRAINT "work_error_rules_field_check" CHECK ((field = ANY (ARRAY['message'::text, 'type'::text, 'file'::text, 'environment'::text]))),
  CONSTRAINT "work_error_rules_pattern_length_check" CHECK (((char_length(pattern) >= 1) AND (char_length(pattern) <= 200))),
  CONSTRAINT "work_error_rules_assignee_check" CHECK (((action = 'assign'::text) = (assignee_user_id IS NOT NULL))),
  CONSTRAINT "work_error_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_rules_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_error_rules_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_rules" IS 'Rules for an error project: drop events whose message, type, file or environment contains a pattern (ignore), or assign new error items to a member (assign).';

REVOKE ALL ON TABLE "public"."work_error_rules" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_rules" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_rules" FROM "anon", "authenticated";

CREATE TABLE "public"."work_error_sourcemaps" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "project_id"   uuid                     NOT NULL,
  "release"      text                     NOT NULL,
  "file"         text                     NOT NULL,
  "object_key"   text                     NOT NULL,
  "size_bytes"   integer                  NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_error_sourcemaps_release_length_check" CHECK ((char_length(release) <= 200)),
  CONSTRAINT "work_error_sourcemaps_file_length_check" CHECK (((char_length(file) >= 1) AND (char_length(file) <= 300))),
  CONSTRAINT "work_error_sourcemaps_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_sourcemaps_project_release_file_key" UNIQUE (project_id, release, file),
  CONSTRAINT "work_error_sourcemaps_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_sourcemaps_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_sourcemaps"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_sourcemaps"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_sourcemaps" IS 'Source maps uploaded for an error project release. The map itself is in R2 (WORK_FILES) under object_key; file is the minified file''s name as stack frames show it.';

REVOKE ALL ON TABLE "public"."work_error_sourcemaps" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_sourcemaps" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_sourcemaps" FROM "anon", "authenticated";

CREATE TABLE "public"."work_attachments" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "work_item_id" uuid                     NOT NULL,
  "file_name"    text                     NOT NULL,
  "content_type" text                     NOT NULL,
  "size_bytes"   integer                  NOT NULL,
  "object_key"   text                     NOT NULL,
  "uploaded_by"  uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_attachments_file_name_length_check" CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))),
  CONSTRAINT "work_attachments_size_check" CHECK (((size_bytes > 0) AND (size_bytes <= 26214400))),
  CONSTRAINT "work_attachments_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_attachments_object_key_key" UNIQUE (object_key),
  CONSTRAINT "work_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_attachments_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_attachments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_attachments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_attachments_work_item_id_idx ON public.work_attachments USING btree (work_item_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_attachments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_attachments" IS 'Files attached to work items (at most 25 MB each). The file is in R2 (WORK_FILES) under object_key; it is never sent to GitHub or to agents.';

REVOKE ALL ON TABLE "public"."work_attachments" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_attachments" TO "service_role";

REVOKE ALL ON TABLE "public"."work_attachments" FROM "anon", "authenticated";

CREATE TABLE "public"."work_milestones" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "project_id"   uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "target_date"  date,
  "position"     integer                  NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_milestones_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "work_milestones_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_milestones_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_milestones_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_milestones"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_milestones_project_id_idx ON public.work_milestones USING btree (project_id, position);

ALTER TABLE "public"."work_items"
  ADD CONSTRAINT "work_items_milestone_id_fkey" FOREIGN KEY (milestone_id) REFERENCES public.work_milestones(id) ON DELETE SET NULL;

CREATE INDEX work_items_milestone_id_idx ON public.work_items USING btree (milestone_id)
  WHERE (milestone_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_milestones"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_milestones" IS 'Milestones within a work project, in order. Items point at one with work_items.milestone_id.';

REVOKE ALL ON TABLE "public"."work_milestones" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_milestones" TO "service_role";

REVOKE ALL ON TABLE "public"."work_milestones" FROM "anon", "authenticated";

CREATE TABLE "public"."work_project_updates" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "project_id"     uuid                     NOT NULL,
  "health"         text                     NOT NULL,
  "body"           text                     NOT NULL,
  "author_user_id" uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_project_updates_health_check" CHECK ((health = ANY (ARRAY['on_track'::text, 'at_risk'::text, 'off_track'::text]))),
  CONSTRAINT "work_project_updates_body_length_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 10000))),
  CONSTRAINT "work_project_updates_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_project_updates_author_user_id_fkey" FOREIGN KEY (author_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_project_updates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_project_updates_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_project_updates"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_project_updates_project_created_idx ON public.work_project_updates USING btree (project_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_project_updates"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_project_updates" IS 'Written status updates on a work project, each with a health (on track, at risk, off track). The newest one is the project''s current health.';

REVOKE ALL ON TABLE "public"."work_project_updates" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_project_updates" TO "service_role";

REVOKE ALL ON TABLE "public"."work_project_updates" FROM "anon", "authenticated";

CREATE TABLE "public"."work_templates" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "name"           text                     NOT NULL,
  "title"          text                     NOT NULL DEFAULT ''::text,
  "description"    text                     NOT NULL DEFAULT ''::text,
  "priority"       smallint                 NOT NULL DEFAULT 0,
  "labels"         text[]                   NOT NULL DEFAULT '{}'::text[],
  "estimate"       smallint,
  "project_id"     uuid,
  "assignee_agent" text,
  "created_by"     uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_templates_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
  CONSTRAINT "work_templates_title_length_check" CHECK ((char_length(title) <= 300)),
  CONSTRAINT "work_templates_description_length_check" CHECK ((char_length(description) <= 20000)),
  CONSTRAINT "work_templates_priority_check" CHECK (((priority >= 0) AND (priority <= 4))),
  CONSTRAINT "work_templates_estimate_check" CHECK (((estimate IS NULL) OR ((estimate >= 0) AND (estimate <= 21)))),
  CONSTRAINT "work_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_templates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_templates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_projects(id) ON DELETE SET NULL,
  CONSTRAINT "work_templates_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_templates"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_templates_workspace_id_idx ON public.work_templates USING btree (workspace_id, name);

CREATE POLICY "deny_direct_client_access" ON "public"."work_templates"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_templates" IS 'Item templates: the fields a new work item starts with. Recurring items are made from a template.';

REVOKE ALL ON TABLE "public"."work_templates" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_templates" TO "service_role";

REVOKE ALL ON TABLE "public"."work_templates" FROM "anon", "authenticated";

CREATE TABLE "public"."work_recurrences" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "template_id"  uuid                     NOT NULL,
  "cadence"      text                     NOT NULL,
  "next_run_at"  timestamp with time zone NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT true,
  "last_item_id" uuid,
  "last_run_at"  timestamp with time zone,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_recurrences_cadence_check" CHECK ((cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "work_recurrences_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_recurrences_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_recurrences_last_item_id_fkey" FOREIGN KEY (last_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_recurrences_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.work_templates(id) ON DELETE CASCADE,
  CONSTRAINT "work_recurrences_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_recurrences"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_recurrences_due_idx ON public.work_recurrences USING btree (next_run_at)
  WHERE enabled;

CREATE POLICY "deny_direct_client_access" ON "public"."work_recurrences"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_recurrences" IS 'Recurring work items: a template made into a new item every day, week or month from next_run_at. Run by web-api''s cron.';

REVOKE ALL ON TABLE "public"."work_recurrences" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_recurrences" TO "service_role";

REVOKE ALL ON TABLE "public"."work_recurrences" FROM "anon", "authenticated";

CREATE TABLE "public"."work_reactions" (
  "event_id"     uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "emoji"        text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_reactions_emoji_check" CHECK ((emoji = ANY (ARRAY['+1'::text, '-1'::text, 'heart'::text, 'tada'::text, 'eyes'::text, 'rocket'::text]))),
  CONSTRAINT "work_reactions_pkey" PRIMARY KEY (event_id, user_id, emoji),
  CONSTRAINT "work_reactions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.work_item_events(id) ON DELETE CASCADE,
  CONSTRAINT "work_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_reactions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_reactions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_reactions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_reactions" IS 'Reactions on work item comments: one row per person per emoji (a fixed set).';

REVOKE ALL ON TABLE "public"."work_reactions" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_reactions" TO "service_role";

REVOKE ALL ON TABLE "public"."work_reactions" FROM "anon", "authenticated";

CREATE TABLE "public"."work_api_keys" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "key_hash"     text                     NOT NULL,
  "key_prefix"   text                     NOT NULL,
  "access"       text                     NOT NULL DEFAULT 'read'::text,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  CONSTRAINT "work_api_keys_access_check" CHECK ((access = ANY (ARRAY['read'::text, 'write'::text]))),
  CONSTRAINT "work_api_keys_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
  CONSTRAINT "work_api_keys_key_hash_key" UNIQUE (key_hash),
  CONSTRAINT "work_api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_api_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_api_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_api_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_api_keys_workspace_id_idx ON public.work_api_keys USING btree (workspace_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_api_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_api_keys" IS 'Keys for the public work API (pwk_ tokens, stored as a SHA-256 hash and a prefix). read lists and reads items; write also creates, changes and comments. Customer requests are never served.';

REVOKE ALL ON TABLE "public"."work_api_keys" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_api_keys" TO "service_role";

REVOKE ALL ON TABLE "public"."work_api_keys" FROM "anon", "authenticated";

CREATE TABLE "public"."work_webhooks" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "url"               text                     NOT NULL,
  "secret_ciphertext" text                     NOT NULL,
  "events"            text[]                   NOT NULL DEFAULT ARRAY['created'::text, 'state'::text, 'comment'::text],
  "enabled"           boolean                  NOT NULL DEFAULT true,
  "cursor_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "cursor_id"         uuid,
  "failure_count"     integer                  NOT NULL DEFAULT 0,
  "last_status"       integer,
  "last_delivery_at"  timestamp with time zone,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_webhooks_url_check" CHECK (((url ~ '^https://'::text) AND (char_length(url) <= 2000))),
  CONSTRAINT "work_webhooks_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_webhooks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_webhooks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_webhooks"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_webhooks_enabled_idx ON public.work_webhooks USING btree (cursor_at)
  WHERE enabled;

CREATE POLICY "deny_direct_client_access" ON "public"."work_webhooks"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_webhooks" IS 'Webhooks for work item events. web-api''s cron sends each one the workspace''s new events after its cursor (signed with its secret, encrypted at rest) and moves the cursor on a 2xx answer. Turned off after 20 failures in a row.';

REVOKE ALL ON TABLE "public"."work_webhooks" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_webhooks" TO "service_role";

REVOKE ALL ON TABLE "public"."work_webhooks" FROM "anon", "authenticated";

CREATE TABLE "public"."work_initiatives" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "description"  text                     NOT NULL DEFAULT ''::text,
  "state"        text                     NOT NULL DEFAULT 'active'::text,
  "target_date"  date,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_initiatives_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT "work_initiatives_description_length_check" CHECK ((char_length(description) <= 20000)),
  CONSTRAINT "work_initiatives_state_check" CHECK ((state = ANY (ARRAY['planned'::text, 'active'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT "work_initiatives_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_initiatives_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_initiatives_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_initiatives"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_initiatives_workspace_id_idx ON public.work_initiatives USING btree (workspace_id, name);

ALTER TABLE "public"."work_projects"
  ADD CONSTRAINT "work_projects_initiative_id_fkey" FOREIGN KEY (initiative_id) REFERENCES public.work_initiatives(id) ON DELETE SET NULL;

CREATE INDEX work_projects_initiative_id_idx ON public.work_projects USING btree (initiative_id)
  WHERE (initiative_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_initiatives"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_initiatives" IS 'Initiatives: groups of work projects towards one goal, shown on the roadmap. Projects point at one with work_projects.initiative_id.';

REVOKE ALL ON TABLE "public"."work_initiatives" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_initiatives" TO "service_role";

REVOKE ALL ON TABLE "public"."work_initiatives" FROM "anon", "authenticated";

CREATE TABLE "public"."work_documents" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "project_id"   uuid,
  "title"        text                     NOT NULL,
  "body"         text                     NOT NULL DEFAULT ''::text,
  "created_by"   uuid,
  "updated_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_documents_title_length_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200))),
  CONSTRAINT "work_documents_body_length_check" CHECK ((char_length(body) <= 200000)),
  CONSTRAINT "work_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_documents_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_documents_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_projects(id) ON DELETE SET NULL,
  CONSTRAINT "work_documents_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_documents"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_documents_workspace_updated_idx ON public.work_documents USING btree (workspace_id, updated_at DESC);

CREATE INDEX work_documents_project_id_idx ON public.work_documents USING btree (project_id)
  WHERE (project_id IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_documents"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_documents" IS 'Documents in the work tracker (Markdown): specs, plans and notes, on their own or in a project.';

REVOKE ALL ON TABLE "public"."work_documents" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_documents" TO "service_role";

REVOKE ALL ON TABLE "public"."work_documents" FROM "anon", "authenticated";

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
  p_seen_at        timestamp with time zone DEFAULT now(),
  p_user_hash      text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Counts one error event against its group, creating the group on first sight. A resolved group
-- that sees a new event is reopened; an ignored group stays ignored. Returns
-- { group_id, workspace_id, is_new, reopened, status, work_item_id, event_count, auto_triage,
-- github_repo, hour_count, spiking, users_count, first_release, resolved_in_release }, or null when the
-- project is unknown or disabled. The caller decides whether a new or reopened group gets a work item.
declare
  v_project public.work_error_projects;
  v_group public.work_error_groups;
  v_previous_status text;
  v_is_new boolean;
  v_hour_count integer;
  v_baseline numeric;
  v_spiking boolean;
  v_new_user boolean := false;
  v_release text := nullif(left(p_release, 200), '');
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
    first_seen_at, last_seen_at, last_release, last_environment, last_event, first_release
  ) values (
    v_project.workspace_id, p_project_id, p_fingerprint, left(p_exception_type, 200), left(coalesce(p_message, ''), 2000),
    left(p_culprit, 500), 'open', 1, p_seen_at, p_seen_at, v_release, left(p_environment, 100),
    coalesce(p_event, '{}'::jsonb), v_release
  )
  on conflict (project_id, fingerprint) do update set
    event_count = error_group.event_count + 1,
    last_seen_at = greatest(error_group.last_seen_at, excluded.last_seen_at),
    message = excluded.message,
    culprit = coalesce(excluded.culprit, error_group.culprit),
    last_release = coalesce(excluded.last_release, error_group.last_release),
    first_release = coalesce(error_group.first_release, excluded.first_release),
    last_environment = coalesce(excluded.last_environment, error_group.last_environment),
    last_event = excluded.last_event,
    status = case when error_group.status = 'resolved' then 'open' else error_group.status end,
    resolved_at = case when error_group.status = 'resolved' then null else error_group.resolved_at end
  returning * into v_group;

  if p_user_hash is not null and char_length(p_user_hash) = 32 then
    insert into public.work_error_group_users (group_id, user_hash, first_seen_at)
    values (v_group.id, p_user_hash, p_seen_at)
    on conflict (group_id, user_hash) do nothing;
    v_new_user := found;
    if v_new_user then
      update public.work_error_groups error_group set users_count = error_group.users_count + 1
      where error_group.id = v_group.id
      returning * into v_group;
    end if;
  end if;

  if v_release is not null then
    insert into public.work_error_releases as release_row (project_id, version, first_seen_at, last_seen_at, event_count, new_groups)
    values (p_project_id, v_release, p_seen_at, p_seen_at, 1, case when v_is_new then 1 else 0 end)
    on conflict (project_id, version) do update set
      last_seen_at = greatest(release_row.last_seen_at, excluded.last_seen_at),
      event_count = release_row.event_count + 1,
      new_groups = release_row.new_groups + excluded.new_groups;
  end if;

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
    'spiking', v_spiking,
    'users_count', v_group.users_count,
    'first_release', v_group.first_release,
    'resolved_in_release', v_group.resolved_in_release
  );
end;
$function$;

COMMENT ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone, text) IS 'Counts one error event against its group (creating or reopening it). Service role only; called by the web-api error ingest route.';

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone, text) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.record_work_error_event(uuid, text, text, text, text, text, text, jsonb, timestamp with time zone, text) TO "service_role";

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

CREATE OR REPLACE FUNCTION public.work_cycle_estimates (
  p_workspace_id uuid,
  p_cycle_id     uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- A cycle's estimate totals: scope (every item but cancelled) and completed (done items), with
-- items without an estimate counted as zero.
select jsonb_build_object(
  'scope', coalesce(sum(item.estimate) filter (where item.state <> 'cancelled'), 0),
  'completed', coalesce(sum(item.estimate) filter (where item.state = 'done'), 0)
)
from public.work_items item
where item.workspace_id = p_workspace_id and item.cycle_id = p_cycle_id;
$function$;

COMMENT ON FUNCTION public.work_cycle_estimates(uuid, uuid) IS 'Estimate totals (scope and completed) for one work cycle. Service role only.';

REVOKE ALL ON FUNCTION public.work_cycle_estimates(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_cycle_estimates(uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_cycle_estimates(uuid, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.snapshot_work_cycle_days (
  p_day          date,
  p_workspace_id uuid DEFAULT NULL,
  p_cycle_id     uuid DEFAULT NULL
)
  RETURNS integer
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records each cycle running on p_day (starts_on <= p_day <= ends_on): its scope (estimates of
-- every item but cancelled), completed (estimates of done items) and item counts, replacing any
-- earlier snapshot that day. Optionally one workspace or one cycle. Returns the cycles recorded.
with totals as (
  insert into public.work_cycle_days as day_row (cycle_id, workspace_id, day, scope, completed, item_count, done_count, recorded_at)
  select
    cycle.id,
    cycle.workspace_id,
    p_day,
    coalesce(sum(item.estimate) filter (where item.state <> 'cancelled'), 0),
    coalesce(sum(item.estimate) filter (where item.state = 'done'), 0),
    count(item.id) filter (where item.state <> 'cancelled')::integer,
    count(item.id) filter (where item.state = 'done')::integer,
    now()
  from public.work_cycles cycle
  left join public.work_items item on item.workspace_id = cycle.workspace_id and item.cycle_id = cycle.id
  where cycle.starts_on <= p_day and cycle.ends_on >= p_day
    and (p_workspace_id is null or cycle.workspace_id = p_workspace_id)
    and (p_cycle_id is null or cycle.id = p_cycle_id)
  group by cycle.id, cycle.workspace_id
  on conflict (cycle_id, day) do update set
    scope = excluded.scope,
    completed = excluded.completed,
    item_count = excluded.item_count,
    done_count = excluded.done_count,
    recorded_at = excluded.recorded_at
  returning 1
)
select count(*)::integer from totals;
$function$;

COMMENT ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) IS 'Records the day''s totals for every work cycle running on that day (or one workspace''s, or one cycle''s), for burn-up charts. Service role only.';

REVOKE ALL ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.snapshot_work_cycle_days(date, uuid, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.work_event_reactions (
  p_workspace_id uuid,
  p_event_ids    uuid[],
  p_user_id      uuid
)
  RETURNS TABLE(event_id uuid, emoji text, count integer, mine boolean)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- For each of the events, how many people reacted with each emoji and whether p_user_id did.
select reaction.event_id, reaction.emoji, count(*)::integer, bool_or(reaction.user_id = p_user_id)
from public.work_reactions reaction
where reaction.workspace_id = p_workspace_id and reaction.event_id = any(p_event_ids)
group by reaction.event_id, reaction.emoji;
$function$;

COMMENT ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) IS 'Reaction counts per work item event and emoji, and whether the given person reacted. Service role only.';

REVOKE ALL ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_event_reactions(uuid, uuid[], uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.work_milestone_counts (
  p_workspace_id uuid,
  p_project_id   uuid
)
  RETURNS TABLE(milestone_id uuid, item_count integer, done_count integer)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Items per milestone of a project (cancelled items left out) and how many are done.
select item.milestone_id,
  count(*) filter (where item.state <> 'cancelled')::integer,
  count(*) filter (where item.state = 'done')::integer
from public.work_items item
join public.work_milestones milestone on milestone.id = item.milestone_id
where item.workspace_id = p_workspace_id and milestone.project_id = p_project_id
group by item.milestone_id;
$function$;

COMMENT ON FUNCTION public.work_milestone_counts(uuid, uuid) IS 'Item and done counts for each milestone of a work project. Service role only.';

REVOKE ALL ON FUNCTION public.work_milestone_counts(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_milestone_counts(uuid, uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_milestone_counts(uuid, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.work_project_health (
  p_workspace_id uuid
)
  RETURNS TABLE(project_id uuid, health text, updated_at timestamp with time zone)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Each project's current health: its newest update's.
select distinct on (update_row.project_id) update_row.project_id, update_row.health, update_row.created_at
from public.work_project_updates update_row
where update_row.workspace_id = p_workspace_id
order by update_row.project_id, update_row.created_at desc;
$function$;

COMMENT ON FUNCTION public.work_project_health(uuid) IS 'The newest project update''s health for each work project in a workspace. Service role only.';

REVOKE ALL ON FUNCTION public.work_project_health(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.work_project_health(uuid) FROM "anon", "authenticated";

GRANT EXECUTE ON FUNCTION public.work_project_health(uuid) TO "service_role";
