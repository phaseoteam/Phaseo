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
