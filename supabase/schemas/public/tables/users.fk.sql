-- Foreign keys in a cross-table reference cycle are split out of their
-- table's file: each file loads atomically, so keeping them inline would
-- deadlock the loader (every file would need a table another pending file
-- creates). These statements apply once all referenced tables exist.

ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_default_workspace_id_fkey" FOREIGN KEY (default_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;
