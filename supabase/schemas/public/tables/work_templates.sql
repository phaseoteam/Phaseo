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
