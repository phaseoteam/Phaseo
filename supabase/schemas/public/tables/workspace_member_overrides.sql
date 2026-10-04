CREATE TABLE "public"."workspace_member_overrides" (
  "workspace_id"                uuid                     NOT NULL,
  "user_id"                     uuid                     NOT NULL,
  "access_role"                 text,
  "department_override_enabled" boolean                  NOT NULL DEFAULT false,
  "department_id"               uuid,
  "department_position"         text,
  "updated_by"                  uuid,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_member_overrides_access_role_check" CHECK (((access_role IS NULL) OR (access_role = ANY (ARRAY['member'::text, 'admin'::text])))),
  CONSTRAINT "workspace_member_overrides_check" CHECK ((department_override_enabled OR (department_id IS NULL))),
  CONSTRAINT "workspace_member_overrides_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE RESTRICT,
  CONSTRAINT "workspace_member_overrides_department_position_check" CHECK (((department_position IS NULL) OR (department_position = ANY (ARRAY['member'::text, 'lead'::text])))),
  CONSTRAINT "workspace_member_overrides_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "workspace_member_overrides_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_member_overrides_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_member_overrides_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_member_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_member_overrides_department_id_workspace_id_idx ON public.workspace_member_overrides USING btree (department_id, workspace_id);

CREATE INDEX workspace_member_overrides_updated_by_idx ON public.workspace_member_overrides USING btree (updated_by);

CREATE INDEX workspace_member_overrides_user_id_idx ON public.workspace_member_overrides USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_member_overrides"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_member_overrides" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_member_overrides" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_member_overrides" FROM "anon", "authenticated";
