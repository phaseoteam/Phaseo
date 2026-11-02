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
