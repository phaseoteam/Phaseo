CREATE TABLE "public"."v2_control_plane_releases" (
  "release_id"        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sequence"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "status"            text                     NOT NULL DEFAULT 'draft'::text,
  "change_summary"    text                     NOT NULL,
  "content_hash"      text,
  "created_by"        uuid,
  "reviewed_by"       uuid,
  "published_by"      uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at"       timestamp with time zone,
  "published_at"      timestamp with time zone,
  "published_once_at" timestamp with time zone,
  "superseded_at"     timestamp with time zone,
  CONSTRAINT "v2_control_plane_releases_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_control_plane_releases_pkey" PRIMARY KEY (release_id),
  CONSTRAINT "v2_control_plane_releases_publish_check" CHECK (((status <> 'published'::text) OR ((reviewed_by IS NOT NULL) AND (published_at IS NOT NULL) AND (published_once_at IS
    NOT NULL) AND (content_hash IS NOT NULL)))),
  CONSTRAINT "v2_control_plane_releases_published_by_fkey" FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_control_plane_releases_review_check" CHECK (((reviewed_by IS NULL) OR (created_by IS NULL) OR (reviewed_by <> created_by))),
  CONSTRAINT "v2_control_plane_releases_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "v2_control_plane_releases_sequence_key" UNIQUE (SEQUENCE),
  CONSTRAINT "v2_control_plane_releases_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'validated'::text, 'published'::text, 'superseded'::text, 'rejected'::text])))
);

ALTER TABLE "public"."v2_control_plane_releases"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_control_plane_releases_created_by_idx ON public.v2_control_plane_releases USING btree (created_by);

CREATE INDEX v2_control_plane_releases_published_by_idx ON public.v2_control_plane_releases USING btree (published_by);

CREATE INDEX v2_control_plane_releases_reviewed_by_idx ON public.v2_control_plane_releases USING btree (reviewed_by);

CREATE UNIQUE INDEX v2_control_plane_single_published_idx ON public.v2_control_plane_releases USING btree (status)
  WHERE (status = 'published'::text);

CREATE TRIGGER prevent_published_control_plane_release_mutation
  BEFORE DELETE OR UPDATE ON public.v2_control_plane_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_published_control_plane_release_mutation();

CREATE POLICY "service_role_full_access" ON "public"."v2_control_plane_releases"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."v2_control_plane_releases_sequence_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_control_plane_releases" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_control_plane_releases" FROM "anon", "authenticated";
