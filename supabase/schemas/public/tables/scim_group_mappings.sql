CREATE TABLE "public"."scim_group_mappings" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"        uuid                     NOT NULL,
  "scim_group_id"       uuid                     NOT NULL,
  "department_id"       uuid                     NOT NULL,
  "access_role"         text                     NOT NULL DEFAULT 'member'::text,
  "department_position" text                     NOT NULL DEFAULT 'member'::text,
  "created_by"          uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_group_mappings_access_role_check" CHECK ((access_role = ANY (ARRAY['member'::text, 'admin'::text]))),
  CONSTRAINT "scim_group_mappings_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "scim_group_mappings_department_position_check" CHECK ((department_position = ANY (ARRAY['member'::text, 'lead'::text]))),
  CONSTRAINT "scim_group_mappings_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "scim_group_mappings_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_group_mappings_scim_group_id_department_id_key" UNIQUE (scim_group_id, department_id),
  CONSTRAINT "scim_group_mappings_scim_group_id_workspace_id_fkey" FOREIGN KEY (scim_group_id, workspace_id) REFERENCES public.scim_groups(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "scim_group_mappings_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT "scim_group_mappings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_group_mappings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX scim_group_mappings_created_by_idx ON public.scim_group_mappings USING btree (created_by);

CREATE INDEX scim_group_mappings_department_id_workspace_id_idx ON public.scim_group_mappings USING btree (department_id, workspace_id);

CREATE INDEX scim_group_mappings_scim_group_id_workspace_id_idx ON public.scim_group_mappings USING btree (scim_group_id, workspace_id);

CREATE INDEX scim_group_mappings_workspace_idx ON public.scim_group_mappings USING btree (workspace_id);

CREATE TRIGGER scim_group_mappings_reconcile
  AFTER INSERT OR DELETE OR UPDATE ON public.scim_group_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_scim_entitlements_trigger();

CREATE TRIGGER zz_scim_group_mappings_refresh_effective
  AFTER INSERT OR DELETE OR UPDATE ON public.scim_group_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_effective_entitlements_after_directory_change();

CREATE POLICY "deny_direct_client_access" ON "public"."scim_group_mappings"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."scim_group_mappings" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_group_mappings" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_group_mappings" FROM "anon", "authenticated";
