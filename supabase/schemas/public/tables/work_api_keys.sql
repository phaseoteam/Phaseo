CREATE TABLE "public"."work_api_keys" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "name"         text                     NOT NULL,
  "key_hash"     text                     NOT NULL,
  "key_prefix"   text                     NOT NULL,
  "access"       text                     NOT NULL DEFAULT 'read'::text,
  "created_by"   uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  CONSTRAINT "work_api_keys_access_check" CHECK ((access = ANY (ARRAY['read'::text, 'write'::text]))),
  CONSTRAINT "work_api_keys_name_length_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
  CONSTRAINT "work_api_keys_key_hash_key" UNIQUE (key_hash),
  CONSTRAINT "work_api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_api_keys_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_api_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_api_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_api_keys_workspace_id_idx ON public.work_api_keys USING btree (workspace_id, created_at);

CREATE POLICY "deny_direct_client_access" ON "public"."work_api_keys"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_api_keys" IS 'Keys for the public work API (pwk_ tokens, stored as a SHA-256 hash and a prefix). read lists and reads items; write also creates, changes and comments. Customer requests are never served.';

REVOKE ALL ON TABLE "public"."work_api_keys" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_api_keys" TO "service_role";

REVOKE ALL ON TABLE "public"."work_api_keys" FROM "anon", "authenticated";
