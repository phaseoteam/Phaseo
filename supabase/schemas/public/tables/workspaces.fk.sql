-- Foreign keys in a cross-table reference cycle are split out of their
-- table's file: each file loads atomically, so keeping them inline would
-- deadlock the loader (every file would need a table another pending file
-- creates). These statements apply once all referenced tables exist.

ALTER TABLE "public"."workspaces"
  ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
