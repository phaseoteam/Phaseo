CREATE TABLE "public"."workspace_rate_limit_policies" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "name"                text                     NOT NULL,
  "description"         text,
  "requests_per_minute" integer,
  "tokens_per_minute"   bigint,
  "concurrent_requests" integer,
  "fail_closed"         boolean                  NOT NULL DEFAULT false,
  "created_by"          uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_rate_limit_policies_concurrent_requests_check" CHECK (((concurrent_requests IS NULL) OR (concurrent_requests > 0))),
  CONSTRAINT "workspace_rate_limit_policies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_rate_limit_policies_description_check" CHECK (((description IS NULL) OR (length(description) <= 500))),
  CONSTRAINT "workspace_rate_limit_policies_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "workspace_rate_limit_policies_limit_present_check" CHECK (((requests_per_minute IS NOT NULL) OR (tokens_per_minute IS NOT NULL) OR (concurrent_requests IS NOT NULL))),
  CONSTRAINT "workspace_rate_limit_policies_name_check" CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100))),
  CONSTRAINT "workspace_rate_limit_policies_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_rate_limit_policies_requests_per_minute_check" CHECK (((requests_per_minute IS NULL) OR (requests_per_minute > 0))),
  CONSTRAINT "workspace_rate_limit_policies_tokens_per_minute_check" CHECK (((tokens_per_minute IS NULL) OR (tokens_per_minute > 0))),
  CONSTRAINT "workspace_rate_limit_policies_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_policies"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_policies_created_by_idx ON public.workspace_rate_limit_policies USING btree (created_by);

CREATE UNIQUE INDEX workspace_rate_limit_policies_workspace_name_idx ON public.workspace_rate_limit_policies USING btree (workspace_id, lower(btrim(name)));

CREATE TRIGGER workspace_rate_limit_policies_set_updated_at
  BEFORE UPDATE ON public.workspace_rate_limit_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_policies"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_policies" IS 'Named gateway rate limits (requests and tokens per minute, concurrent requests). A NULL limit column means that dimension is not limited. Applied through workspace_rate_limit_policy_assignments; the most restrictive applicable policy wins.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_policies" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_policies" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_policies" FROM "anon", "authenticated";
