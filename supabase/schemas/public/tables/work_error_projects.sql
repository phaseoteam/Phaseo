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
