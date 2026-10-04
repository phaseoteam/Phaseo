-- Foreign keys in a cross-table reference cycle are split out of their
-- table's file: each file loads atomically, so keeping them inline would
-- deadlock the loader (every file would need a table another pending file
-- creates). These statements apply once all referenced tables exist.

ALTER TABLE "public"."presets"
  ADD CONSTRAINT "presets_active_version_fkey" FOREIGN KEY (active_version_id) REFERENCES public.preset_versions(id) ON DELETE SET NULL;

ALTER TABLE "public"."presets"
  ADD CONSTRAINT "presets_source_version_fkey" FOREIGN KEY (source_preset_version_id) REFERENCES public.preset_versions(id) ON DELETE SET NULL;

ALTER TABLE "public"."presets"
  ADD CONSTRAINT "presets_upstream_version_fkey" FOREIGN KEY (upstream_version_id) REFERENCES public.preset_versions(id) ON DELETE SET NULL;
