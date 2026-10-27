CREATE TABLE "public"."workspace_rate_limit_throttles_minute" (
  "bucket_start"       timestamp with time zone NOT NULL,
  "workspace_id"       uuid                     NOT NULL,
  "policy_id"          uuid                     NOT NULL,
  "limit_scope"        text                     NOT NULL,
  "key_id"             uuid,
  "throttled_requests" integer                  NOT NULL,
  CONSTRAINT "workspace_rate_limit_throttles_minute_key" UNIQUE NULLS NOT DISTINCT (workspace_id, bucket_start, policy_id, limit_scope, key_id),
  CONSTRAINT "workspace_rate_limit_throttles_minute_limit_scope_check"
    CHECK ((limit_scope = ANY (ARRAY['key'::text, 'member'::text, 'guardrail'::text, 'end_user'::text, 'department'::text]))),
  CONSTRAINT "workspace_rate_limit_throttles_minute_throttled_requests_check" CHECK ((throttled_requests > 0)),
  CONSTRAINT "workspace_rate_limit_throttles_minute_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_throttles_minute"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_throttles_minute_bucket_idx ON public.workspace_rate_limit_throttles_minute USING btree (bucket_start);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_throttles_minute"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_throttles_minute" IS 'Requests rejected by a workspace rate limit policy, per minute, policy, limit scope and API key (null for OAuth requests). Rebuilt from v2_request_facts by refresh_rate_limit_throttle_rollups; kept for 30 days.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_throttles_minute" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."workspace_rate_limit_throttles_minute" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_throttles_minute" FROM "anon", "authenticated";
