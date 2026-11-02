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
