-- Foreign keys in a cross-table reference cycle are split out of their
-- table's file: each file loads atomically, so keeping them inline would
-- deadlock the loader (every file would need a table another pending file
-- creates). These statements apply once all referenced tables exist.

ALTER TABLE "public"."preset_versions"
  ADD CONSTRAINT "preset_versions_preset_id_fkey" FOREIGN KEY (preset_id) REFERENCES public.presets(id) ON DELETE CASCADE;
