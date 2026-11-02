CREATE TABLE "public"."work_attachments" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "work_item_id" uuid                     NOT NULL,
  "file_name"    text                     NOT NULL,
  "content_type" text                     NOT NULL,
  "size_bytes"   integer                  NOT NULL,
  "object_key"   text                     NOT NULL,
  "uploaded_by"  uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_attachments_file_name_length_check" CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 200))),
  CONSTRAINT "work_attachments_size_check" CHECK (((size_bytes > 0) AND (size_bytes <= 26214400))),
  CONSTRAINT "work_attachments_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_attachments_object_key_key" UNIQUE (object_key),
  CONSTRAINT "work_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_attachments_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_attachments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_attachments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_attachments_work_item_id_idx ON public.work_attachments USING btree (work_item_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_attachments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_attachments" IS 'Files attached to work items (at most 25 MB each). The file is in R2 (WORK_FILES) under object_key; it is never sent to GitHub or to agents.';

REVOKE ALL ON TABLE "public"."work_attachments" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_attachments" TO "service_role";

REVOKE ALL ON TABLE "public"."work_attachments" FROM "anon", "authenticated";
