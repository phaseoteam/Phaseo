CREATE TABLE "public"."payment_method_mutation_leases" (
  "workspace_id" uuid                     NOT NULL,
  "claim_token"  uuid                     NOT NULL,
  "expires_at"   timestamp with time zone NOT NULL,
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payment_method_mutation_leases_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "payment_method_mutation_leases_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."payment_method_mutation_leases"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."payment_method_mutation_leases"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."payment_method_mutation_leases" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."payment_method_mutation_leases" TO "service_role";

REVOKE ALL ON TABLE "public"."payment_method_mutation_leases" FROM "anon", "authenticated";
