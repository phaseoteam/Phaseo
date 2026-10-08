CREATE TABLE "private"."usage_workspace_identity" (
  "workspace_id" uuid NOT NULL,
  CONSTRAINT "usage_workspace_identity_pkey" PRIMARY KEY (workspace_id)
);

ALTER TABLE "private"."usage_workspace_identity"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "private"."usage_workspace_identity"
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT SELECT ON TABLE "private"."usage_workspace_identity" TO "service_role";

COMMENT ON TABLE "private"."usage_workspace_identity" IS 'Permanent workspace UUIDs for usage and accounting history; contains no account identity or access grants.';
