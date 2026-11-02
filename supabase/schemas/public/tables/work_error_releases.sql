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
