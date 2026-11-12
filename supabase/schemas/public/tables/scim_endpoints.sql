CREATE TABLE "public"."scim_endpoints" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_endpoints_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_endpoints_workspace_id_key" UNIQUE (workspace_id),
  CONSTRAINT "scim_endpoints_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_endpoints"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."scim_endpoints"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."scim_endpoints" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_endpoints" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_endpoints" FROM "anon", "authenticated";
