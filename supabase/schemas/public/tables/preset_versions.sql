CREATE TABLE "public"."preset_versions" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "preset_id"         uuid                     NOT NULL,
  "version_number"    integer                  NOT NULL,
  "version_label"     text                     NOT NULL,
  "versioning_method" text                     NOT NULL,
  "name"              text                     NOT NULL,
  "slug"              text                     NOT NULL,
  "description"       text,
  "config"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "visibility"        text                     NOT NULL,
  "release_notes"     text,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "preset_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "preset_versions_preset_id_id_key" UNIQUE (preset_id, id),
  CONSTRAINT "preset_versions_preset_id_version_label_key" UNIQUE (preset_id, version_label),
  CONSTRAINT "preset_versions_preset_id_version_number_key" UNIQUE (preset_id, version_number),
  CONSTRAINT "preset_versions_version_number_check" CHECK ((version_number > 0)),
  CONSTRAINT "preset_versions_versioning_method_check" CHECK ((versioning_method = ANY (ARRAY['sequential'::text, 'semver'::text, 'date'::text]))),
  CONSTRAINT "preset_versions_visibility_check" CHECK ((visibility = ANY (ARRAY['private'::text, 'team'::text, 'public'::text]))),
  CONSTRAINT "preset_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL
);

ALTER TABLE "public"."preset_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX preset_versions_created_by_idx ON public.preset_versions USING btree (created_by);

CREATE INDEX preset_versions_preset_created_idx ON public.preset_versions USING btree (preset_id, version_number DESC);

CREATE POLICY "preset_versions_no_oauth_client_insert" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'client_id'::text) IS NULL));

CREATE POLICY "preset_versions_no_oauth_client_update" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (((( SELECT auth.jwt() AS jwt) ->> 'client_id'::text) IS NULL))
  WITH CHECK (((( SELECT auth.jwt() AS jwt) ->> 'client_id'::text) IS NULL));

CREATE POLICY "preset_versions_no_oauth_client_delete" ON "public"."preset_versions"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (((( SELECT auth.jwt() AS jwt) ->> 'client_id'::text) IS NULL));

CREATE POLICY "service_role_full_access" ON "public"."preset_versions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."preset_versions" TO "service_role";

REVOKE ALL ON TABLE "public"."preset_versions" FROM "anon", "authenticated";
