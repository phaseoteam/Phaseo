CREATE TABLE "public"."work_intake_forms" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "name"          text                     NOT NULL,
  "token_hash"    text                     NOT NULL,
  "token_prefix"  text                     NOT NULL,
  "email_alias"  text,
  "enabled"       boolean                  NOT NULL DEFAULT true,
  "auto_triage"   boolean                  NOT NULL DEFAULT true,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at"  timestamp with time zone,
  CONSTRAINT "work_intake_forms_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_intake_forms_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "work_intake_forms_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_intake_forms_token_hash_key" UNIQUE (token_hash),
  CONSTRAINT "work_intake_forms_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_intake_forms"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_intake_forms_created_by_idx ON public.work_intake_forms USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_intake_forms_workspace_id_idx ON public.work_intake_forms USING btree (workspace_id);

CREATE UNIQUE INDEX work_intake_forms_email_alias_key ON public.work_intake_forms USING btree (email_alias)
  WHERE (email_alias IS NOT NULL);

ALTER TABLE "public"."work_intake_forms"
  ADD CONSTRAINT "work_intake_forms_email_alias_check" CHECK (((email_alias IS NULL) OR (email_alias ~ '^[a-z0-9]{16,32}$'::text)));

CREATE POLICY "deny_direct_client_access" ON "public"."work_intake_forms"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_intake_forms" IS 'Public intake endpoints (web forms, email forwarders, support widgets) that create asks. The token is shown once; only its SHA-256 hash is stored.';

REVOKE ALL ON TABLE "public"."work_intake_forms" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_intake_forms" TO "service_role";

REVOKE ALL ON TABLE "public"."work_intake_forms" FROM "anon", "authenticated";
