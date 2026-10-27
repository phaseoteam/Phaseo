SET local check_function_bodies = off;

-- Named gateway rate limit policies, where they apply, and an optional department on each API key.

UPDATE public.oauth_clients
SET allowed_scopes = array(
  SELECT DISTINCT scope
  FROM unnest(coalesce(allowed_scopes, '{}'::text[]) || array['rate_limits:read', 'rate_limits:write', 'rate_limits:delete']) scope
  ORDER BY scope
), updated_at = now()
WHERE id = 'phaseo_cli';

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

CREATE INDEX workspace_rate_limit_policies_workspace_created_idx ON public.workspace_rate_limit_policies USING btree (workspace_id, created_at, id);

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

CREATE TABLE "public"."workspace_rate_limit_policy_assignments" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "policy_id"     uuid                     NOT NULL,
  "target_type"   text                     NOT NULL,
  "key_id"        uuid,
  "user_id"       uuid,
  "department_id" uuid,
  "guardrail_id"  uuid,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_rate_limit_policy_assignments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_rate_limit_policy_assignments_department_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_rate_limit_policy_assignments_guardrail_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_rate_limit_policy_assignments_key_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_rate_limit_policy_assignments_member_fkey" FOREIGN KEY (workspace_id, user_id) REFERENCES public.workspace_members(workspace_id, user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_rate_limit_policy_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_rate_limit_policy_assignments_policy_fkey" FOREIGN KEY (policy_id, workspace_id) REFERENCES public.workspace_rate_limit_policies(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_rate_limit_policy_assignments_target_check" CHECK ((((target_type = 'key'::text) AND (key_id IS NOT NULL) AND (num_nonnulls(user_id, department_id, guardrail_id) = 0)) OR ((target_type = 'member'::text) AND (user_id IS NOT NULL) AND (num_nonnulls(key_id, department_id, guardrail_id) = 0)) OR ((target_type = 'department'::text) AND (department_id IS NOT NULL) AND (num_nonnulls(key_id, user_id, guardrail_id) = 0)) OR ((target_type = 'guardrail'::text) AND (guardrail_id IS NOT NULL) AND (num_nonnulls(key_id, user_id, department_id) = 0)) OR ((target_type = 'end_user_default'::text) AND (num_nonnulls(key_id, user_id, department_id, guardrail_id) = 0)))),
  CONSTRAINT "workspace_rate_limit_policy_assignments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_policy_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_policy_assignments_created_by_idx ON public.workspace_rate_limit_policy_assignments USING btree (created_by);

CREATE UNIQUE INDEX workspace_rate_limit_policy_assignments_department_uidx ON public.workspace_rate_limit_policy_assignments USING btree (department_id, workspace_id)
  WHERE (department_id IS NOT NULL);

CREATE UNIQUE INDEX workspace_rate_limit_policy_assignments_end_user_uidx ON public.workspace_rate_limit_policy_assignments USING btree (workspace_id)
  WHERE (target_type = 'end_user_default'::text);

CREATE UNIQUE INDEX workspace_rate_limit_policy_assignments_guardrail_uidx ON public.workspace_rate_limit_policy_assignments USING btree (guardrail_id)
  WHERE (guardrail_id IS NOT NULL);

CREATE UNIQUE INDEX workspace_rate_limit_policy_assignments_key_uidx ON public.workspace_rate_limit_policy_assignments USING btree (key_id)
  WHERE (key_id IS NOT NULL);

CREATE UNIQUE INDEX workspace_rate_limit_policy_assignments_member_uidx ON public.workspace_rate_limit_policy_assignments USING btree (workspace_id, user_id)
  WHERE (user_id IS NOT NULL);

CREATE INDEX workspace_rate_limit_policy_assignments_policy_idx ON public.workspace_rate_limit_policy_assignments USING btree (policy_id, workspace_id);

CREATE INDEX workspace_rate_limit_policy_assignments_workspace_created_idx ON public.workspace_rate_limit_policy_assignments USING btree (workspace_id, created_at, id);

CREATE TRIGGER workspace_rate_limit_policy_assignments_set_updated_at
  BEFORE UPDATE ON public.workspace_rate_limit_policy_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_policy_assignments"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_policy_assignments" IS 'Where a rate limit policy applies: one API key, one workspace member, one department (a shared allowance), one guardrail (a separate allowance for each key and member it covers), or the workspace default for each end user. Each target has at most one policy.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_policy_assignments" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_policy_assignments" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_policy_assignments" FROM "anon", "authenticated";

ALTER TABLE "public"."keys"
  ADD COLUMN "department_id" uuid;

ALTER TABLE "public"."keys"
  ADD CONSTRAINT "keys_department_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id) ON DELETE SET NULL (department_id);

CREATE INDEX keys_department_id_idx ON public.keys USING btree (department_id, workspace_id)
  WHERE (department_id IS NOT NULL);

COMMENT ON COLUMN "public"."keys"."department_id" IS 'Department whose limits and budgets this key counts toward. NULL means the key counts only toward workspace-wide limits. Requests made with OAuth use the user''s department instead.';
