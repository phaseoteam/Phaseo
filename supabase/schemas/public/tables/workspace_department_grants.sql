CREATE TABLE "public"."workspace_department_grants" (
  "workspace_id"  uuid                     NOT NULL,
  "user_id"       uuid                     NOT NULL,
  "department_id" uuid                     NOT NULL,
  "source_type"   text                     NOT NULL,
  "source_id"     uuid                     NOT NULL,
  "position"      text                     NOT NULL DEFAULT 'member'::text,
  "is_primary"    boolean                  NOT NULL DEFAULT false,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_department_grants_pkey" PRIMARY KEY (workspace_id, user_id, department_id, source_type, source_id),
  CONSTRAINT "workspace_department_grants_position_check" CHECK (("position" = ANY (ARRAY['member'::text, 'lead'::text]))),
  CONSTRAINT "workspace_department_grants_source_type_check" CHECK ((source_type = ANY (ARRAY['manual'::text, 'scim_group'::text]))),
  CONSTRAINT "workspace_department_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_department_grants_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT "workspace_department_grants_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_department_grants"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_department_grants_department_idx ON public.workspace_department_grants USING btree (workspace_id, department_id, user_id);

CREATE INDEX workspace_department_grants_user_id_idx ON public.workspace_department_grants USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_department_grants"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_department_grants" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_department_grants" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_department_grants" FROM "anon", "authenticated";
