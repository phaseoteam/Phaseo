CREATE TABLE "public"."scim_groups" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "external_id"  text,
  "display_name" text                     NOT NULL,
  "version"      bigint                   NOT NULL DEFAULT 1,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_groups_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "scim_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_groups_version_check" CHECK ((version > 0)),
  CONSTRAINT "scim_groups_workspace_external_id_key" UNIQUE (workspace_id, external_id),
  CONSTRAINT "scim_groups_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_groups"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."scim_groups"
  ADD COLUMN "display_name_normalized" text GENERATED ALWAYS AS (lower(display_name)) STORED;

ALTER TABLE "public"."scim_groups"
  ADD CONSTRAINT "scim_groups_workspace_display_name_key" UNIQUE (workspace_id, display_name_normalized);

CREATE TRIGGER scim_groups_provision_department
  AFTER INSERT OR UPDATE OF display_name ON public.scim_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_department_from_scim_group();

CREATE TRIGGER scim_groups_touch_resource
  BEFORE UPDATE ON public.scim_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_scim_resource();

CREATE POLICY "deny_direct_client_access" ON "public"."scim_groups"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."scim_groups" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_groups" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_groups" FROM "anon", "authenticated";
