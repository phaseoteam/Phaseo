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
