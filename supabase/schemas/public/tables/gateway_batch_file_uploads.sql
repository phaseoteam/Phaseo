CREATE TABLE "public"."gateway_batch_file_uploads" (
  "workspace_id"     uuid                     NOT NULL,
  "upload_id"        text                     NOT NULL,
  "bytes"            bigint                   NOT NULL,
  "status"           text                     NOT NULL,
  "provider_file_id" text,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_batch_file_uploads_bytes_check" CHECK ((bytes > 0)),
  CONSTRAINT "gateway_batch_file_uploads_pkey" PRIMARY KEY (workspace_id, upload_id),
  CONSTRAINT "gateway_batch_file_uploads_status_check" CHECK ((status = ANY (ARRAY['claimed'::text, 'completed'::text, 'failed'::text]))),
  CONSTRAINT "gateway_batch_file_uploads_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_batch_file_uploads"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."gateway_batch_file_uploads"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_batch_file_uploads" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_batch_file_uploads" FROM "anon", "authenticated";
