CREATE TABLE "public"."workspace_member_effective_entitlements" (
  "workspace_id"        uuid                     NOT NULL,
  "user_id"             uuid                     NOT NULL,
  "access_role"         text                     NOT NULL,
  "department_id"       uuid,
  "department_position" text,
  "access_source"       text                     NOT NULL,
  "department_source"   text                     NOT NULL,
  "computed_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_member_effective_enti_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE RESTRICT,
  CONSTRAINT "workspace_member_effective_entitlemen_department_position_check"
    CHECK (((department_position IS NULL) OR (department_position = ANY (ARRAY['member'::text, 'lead'::text])))),
  CONSTRAINT "workspace_member_effective_entitlements_access_role_check" CHECK ((access_role = ANY (ARRAY['member'::text, 'admin'::text, 'owner'::text]))),
  CONSTRAINT "workspace_member_effective_entitlements_access_source_check"
    CHECK ((access_source = ANY (ARRAY['owner'::text, 'manual_override'::text, 'workspace'::text, 'scim'::text]))),
  CONSTRAINT "workspace_member_effective_entitlements_department_source_check"
    CHECK ((department_source = ANY (ARRAY['manual_override'::text, 'manual'::text, 'scim'::text, 'none'::text]))),
  CONSTRAINT "workspace_member_effective_entitlements_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "workspace_member_effective_entitlements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_member_effective_entitlements_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_member_effective_entitlements"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_member_effective_enti_department_id_workspace_id_idx ON public.workspace_member_effective_entitlements USING btree (department_id, workspace_id);

CREATE INDEX workspace_member_effective_entitlements_user_id_idx ON public.workspace_member_effective_entitlements USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_member_effective_entitlements"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_member_effective_entitlements" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_member_effective_entitlements" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_member_effective_entitlements" FROM "anon", "authenticated";
