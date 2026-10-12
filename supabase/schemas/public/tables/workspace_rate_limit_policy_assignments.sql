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
