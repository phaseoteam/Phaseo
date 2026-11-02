CREATE TABLE "public"."work_error_rules" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     uuid                     NOT NULL,
  "project_id"       uuid                     NOT NULL,
  "action"           text                     NOT NULL,
  "field"            text                     NOT NULL,
  "pattern"          text                     NOT NULL,
  "assignee_user_id" uuid,
  "enabled"          boolean                  NOT NULL DEFAULT true,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_error_rules_action_check" CHECK ((action = ANY (ARRAY['ignore'::text, 'assign'::text]))),
  CONSTRAINT "work_error_rules_field_check" CHECK ((field = ANY (ARRAY['message'::text, 'type'::text, 'file'::text, 'environment'::text]))),
  CONSTRAINT "work_error_rules_pattern_length_check" CHECK (((char_length(pattern) >= 1) AND (char_length(pattern) <= 200))),
  CONSTRAINT "work_error_rules_assignee_check" CHECK (((action = 'assign'::text) = (assignee_user_id IS NOT NULL))),
  CONSTRAINT "work_error_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_error_rules_assignee_user_id_fkey" FOREIGN KEY (assignee_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_error_rules_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.work_error_projects(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_error_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_rules"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_rules" IS 'Rules for an error project: drop events whose message, type, file or environment contains a pattern (ignore), or assign new error items to a member (assign).';

REVOKE ALL ON TABLE "public"."work_error_rules" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_error_rules" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_rules" FROM "anon", "authenticated";
