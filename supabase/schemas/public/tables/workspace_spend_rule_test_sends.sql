CREATE TABLE "public"."workspace_spend_rule_test_sends" (
  "workspace_id"  uuid                     NOT NULL,
  "bucket_start"  timestamp with time zone NOT NULL,
  "request_count" integer                  NOT NULL,
  CONSTRAINT "workspace_spend_rule_test_sends_pkey" PRIMARY KEY (workspace_id, bucket_start),
  CONSTRAINT "workspace_spend_rule_test_sends_request_count_check" CHECK ((request_count >= 1)),
  CONSTRAINT "workspace_spend_rule_test_sends_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rule_test_sends"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_test_sends_bucket_start_idx ON public.workspace_spend_rule_test_sends USING btree (bucket_start);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_rule_test_sends"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_spend_rule_test_sends" IS 'Spend rule test sends per workspace per minute, for the abuse cap of 5 a minute (public.consume_spend_rule_test_send). Rows older than a day are pruned as new ones are written. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_test_sends" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_test_sends" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_test_sends" FROM "anon", "authenticated";
