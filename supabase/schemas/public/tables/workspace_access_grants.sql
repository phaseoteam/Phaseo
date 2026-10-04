CREATE TABLE "public"."workspace_access_grants" (
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "source_type"  text                     NOT NULL,
  "source_id"    uuid                     NOT NULL,
  "access_role"  text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_access_grants_access_role_check" CHECK ((access_role = ANY (ARRAY['member'::text, 'admin'::text, 'owner'::text]))),
  CONSTRAINT "workspace_access_grants_pkey" PRIMARY KEY (workspace_id, user_id, source_type, source_id),
  CONSTRAINT "workspace_access_grants_source_type_check" CHECK ((source_type = ANY (ARRAY['manual'::text, 'scim_group'::text]))),
  CONSTRAINT "workspace_access_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_access_grants_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_access_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_access_grants_effective_idx ON public.workspace_access_grants USING btree (workspace_id, user_id, access_role);

CREATE INDEX workspace_access_grants_user_id_idx ON public.workspace_access_grants USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_access_grants"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_access_grants" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_access_grants" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_access_grants" FROM "anon", "authenticated";
