CREATE TABLE "public"."workspace_spend_rule_dirty" (
  "workspace_id" uuid                     NOT NULL,
  "dirtied_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_rule_dirty_pkey" PRIMARY KEY (workspace_id)
);

ALTER TABLE "public"."workspace_spend_rule_dirty"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_dirty_dirtied_at_idx ON public.workspace_spend_rule_dirty USING btree (dirtied_at);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_rule_dirty"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_spend_rule_dirty" IS 'Workspaces whose spend changed since their spend rules were last evaluated. Marked when usage is rolled up; public.sweep_spend_rules claims rows with SKIP LOCKED and deletes them. No foreign key, so marking from the rollup can never fail for a deleted workspace; the sweep skips workspaces that no longer exist. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_dirty" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_dirty" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_dirty" FROM "anon", "authenticated";
