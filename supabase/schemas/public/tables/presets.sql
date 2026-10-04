CREATE TABLE "public"."presets" (
  "id"                       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"             uuid                     NOT NULL,
  "name"                     text                     NOT NULL,
  "description"              text,
  "config"                   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_by"               uuid,
  "created_at"               timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"               timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "visibility"               text                     NOT NULL DEFAULT 'team'::text,
  "source_preset_id"         uuid,
  "slug"                     text                     NOT NULL,
  "draft_name"               text,
  "draft_slug"               text,
  "draft_description"        text,
  "draft_config"             jsonb,
  "draft_visibility"         text,
  "active_version_id"        uuid,
  "source_preset_version_id" uuid,
  "upstream_version_id"      uuid,
  "root_preset_id"           uuid,
  "fork_depth"               integer                  NOT NULL DEFAULT 0,
  "versioning_method"        text                     NOT NULL DEFAULT 'sequential'::text,
  "archived_at"              timestamp with time zone,
  CONSTRAINT "presets_pkey" PRIMARY KEY (id),
  CONSTRAINT "presets_public_requires_creator" CHECK (((visibility <> 'public'::text) OR (created_by IS NOT NULL))),
  CONSTRAINT "presets_root_preset_fkey" FOREIGN KEY (root_preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "presets_source_preset_id_fkey" FOREIGN KEY (source_preset_id) REFERENCES public.presets(id) ON DELETE SET NULL,
  CONSTRAINT "presets_versioning_method_check" CHECK ((versioning_method = ANY (ARRAY['sequential'::text, 'semver'::text, 'date'::text]))),
  CONSTRAINT "presets_visibility_check" CHECK ((visibility = ANY (ARRAY['private'::text, 'team'::text, 'public'::text]))),
  CONSTRAINT "presets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "presets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."presets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX presets_active_version_idx ON public.presets USING btree (active_version_id);

CREATE INDEX presets_config_gin_idx ON public.presets USING gin (config);

CREATE INDEX presets_created_by_idx ON public.presets USING btree (created_by);

CREATE INDEX presets_name_workspace_id_idx ON public.presets USING btree (name, workspace_id);

CREATE UNIQUE INDEX presets_public_workspace_slug_key ON public.presets USING btree (workspace_id, lower(slug))
  WHERE (visibility = 'public'::text);

CREATE INDEX presets_root_preset_idx ON public.presets USING btree (root_preset_id);

CREATE INDEX presets_slug_idx ON public.presets USING btree (slug);

CREATE INDEX presets_source_preset_id_idx ON public.presets USING btree (source_preset_id);

CREATE INDEX presets_source_version_idx ON public.presets USING btree (source_preset_version_id);

CREATE INDEX presets_upstream_version_idx ON public.presets USING btree (upstream_version_id);

CREATE INDEX presets_visibility_idx ON public.presets USING btree (visibility);

CREATE UNIQUE INDEX presets_workspace_id_slug_idx ON public.presets USING btree (workspace_id, slug);

CREATE INDEX presets_workspace_slug_ci_idx ON public.presets USING btree (workspace_id, lower(slug));

CREATE TRIGGER presets_finish_creation
  AFTER INSERT ON public.presets
  FOR EACH ROW
  EXECUTE FUNCTION public.finish_preset_creation();

CREATE TRIGGER presets_prepare_lineage
  BEFORE INSERT ON public.presets
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_preset_lineage();

CREATE TRIGGER presets_sync_legacy_writes
  BEFORE UPDATE OF name, slug, description, config, visibility ON public.presets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_legacy_preset_writes_to_draft();

CREATE POLICY "presets_delete_owned" ON "public"."presets"
  FOR DELETE
  TO "authenticated"
  USING ((created_by = ( SELECT auth.uid() AS uid)));

CREATE POLICY "presets_insert_owned" ON "public"."presets"
  FOR INSERT
  TO "authenticated"
  WITH
    CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND public.is_workspace_member(workspace_id) AND (visibility = ANY (ARRAY['private'::text, 'team'::text, 'public'::text]))));

CREATE POLICY "presets_select_public_anon" ON "public"."presets"
  FOR SELECT
  TO "anon"
  USING ((visibility = 'public'::text));

CREATE POLICY "presets_select_visible" ON "public"."presets"
  FOR SELECT
  TO "authenticated"
  USING (((visibility = 'public'::text) OR (created_by = ( SELECT auth.uid() AS uid)) OR ((visibility = 'team'::text) AND public.is_workspace_member(workspace_id))));

CREATE POLICY "presets_update_owned" ON "public"."presets"
  FOR UPDATE
  TO "authenticated"
  USING ((created_by = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."presets" TO "anon", "authenticated", "service_role";

COMMENT ON INDEX "public"."presets_public_workspace_slug_key" IS 'Public preset slugs are unique within their workspace publisher namespace.';
