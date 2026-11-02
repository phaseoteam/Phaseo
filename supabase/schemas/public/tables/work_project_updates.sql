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
