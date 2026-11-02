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
