CREATE TABLE "public"."scim_users" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         uuid                     NOT NULL,
  "auth_user_id"         uuid,
  "external_id"          text,
  "user_name"            text                     NOT NULL,
  "active"               boolean                  NOT NULL DEFAULT true,
  "display_name"         text,
  "given_name"           text,
  "family_name"          text,
  "employee_number"      text,
  "cost_center"          text,
  "organization"         text,
  "division"             text,
  "department"           text,
  "manager_scim_user_id" uuid,
  "emails"               jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "phone_numbers"        jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "addresses"            jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "locale"               text,
  "preferred_language"   text,
  "timezone"             text,
  "title"                text,
  "user_type"            text,
  "version"              bigint                   NOT NULL DEFAULT 1,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_users_addresses_array_check" CHECK ((jsonb_typeof(addresses) = 'array'::text)),
  CONSTRAINT "scim_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "scim_users_emails_array_check" CHECK ((jsonb_typeof(emails) = 'array'::text)),
  CONSTRAINT "scim_users_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "scim_users_manager_workspace_fkey" FOREIGN KEY (manager_scim_user_id, workspace_id) REFERENCES public.scim_users(id, workspace_id) ON DELETE
    SET NULL (manager_scim_user_id),
  CONSTRAINT "scim_users_phone_numbers_array_check" CHECK ((jsonb_typeof(phone_numbers) = 'array'::text)),
  CONSTRAINT "scim_users_pkey" PRIMARY KEY (id),
  CONSTRAINT "scim_users_version_check" CHECK ((version > 0)),
  CONSTRAINT "scim_users_workspace_auth_user_id_key" UNIQUE (workspace_id, auth_user_id),
  CONSTRAINT "scim_users_workspace_external_id_key" UNIQUE (workspace_id, external_id),
  CONSTRAINT "scim_users_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_users"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."scim_users"
  ADD COLUMN "user_name_normalized" text GENERATED ALWAYS AS (lower(user_name)) STORED;

ALTER TABLE "public"."scim_users"
  ADD CONSTRAINT "scim_users_workspace_user_name_key" UNIQUE (workspace_id, user_name_normalized);

CREATE INDEX scim_users_auth_user_id_idx ON public.scim_users USING btree (auth_user_id);

CREATE INDEX scim_users_manager_scim_user_id_idx ON public.scim_users USING btree (manager_scim_user_id);

CREATE INDEX scim_users_manager_workspace_idx ON public.scim_users USING btree (manager_scim_user_id, workspace_id);

CREATE INDEX scim_users_workspace_active_idx ON public.scim_users USING btree (workspace_id, active);

CREATE TRIGGER scim_users_sync_workspace_access
  AFTER INSERT OR UPDATE OF active, auth_user_id, department ON public.scim_users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_scim_user_workspace_access();

CREATE TRIGGER scim_users_touch_resource
  BEFORE UPDATE ON public.scim_users
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_scim_resource();

CREATE TRIGGER zz_scim_users_refresh_effective
  AFTER INSERT OR UPDATE OF active, auth_user_id, department ON public.scim_users
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_effective_entitlements_after_directory_change();

CREATE POLICY "deny_direct_client_access" ON "public"."scim_users"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."scim_users" IS 'Workspace-scoped SCIM directory users, separate from login identities until SSO linking.';

REVOKE ALL ON TABLE "public"."scim_users" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_users" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_users" FROM "anon", "authenticated";
