CREATE TABLE "public"."workspaces" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"             text                     NOT NULL,
  "slug"             text                     NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "tier"             text                     DEFAULT 'basic'::text,
  "billing_mode"     text                     NOT NULL DEFAULT 'wallet'::text,
  "publisher_handle" text                     NOT NULL,
  "workspace_kind"   text                     NOT NULL DEFAULT 'personal'::text,
  "logo_url"         text,
  CONSTRAINT "workspaces_billing_mode_check" CHECK ((billing_mode = ANY (ARRAY['wallet'::text, 'invoice'::text]))),
  CONSTRAINT "workspaces_logo_url_safe" CHECK (((logo_url IS NULL) OR (logo_url ~ '^https://'::text) OR (logo_url ~ '^/api/_web/profile-avatars/workspaces/'::text))),
  CONSTRAINT "workspaces_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspaces_publisher_handle_format" CHECK ((publisher_handle ~ '^[a-z0-9][a-z0-9_-]{2,39}$'::text)),
  CONSTRAINT "workspaces_slug_key" UNIQUE (slug),
  CONSTRAINT "workspaces_workspace_kind_check" CHECK ((workspace_kind = ANY (ARRAY['personal'::text, 'organization'::text, 'enterprise'::text, 'provider'::text]))),
  "owner_user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."workspaces"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspaces_kind_idx ON public.workspaces USING btree (workspace_kind, id);

CREATE INDEX workspaces_name_trgm_search_idx ON public.workspaces USING gin (name extensions.gin_trgm_ops);

CREATE UNIQUE INDEX workspaces_publisher_handle_key ON public.workspaces USING btree (lower(publisher_handle));

CREATE TRIGGER aaa_workspaces_capture_usage_identity
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_usage_workspace_identity();

CREATE TRIGGER gateway_workspace_publication
  AFTER UPDATE OF tier, billing_mode ON public.workspaces
  FOR EACH ROW
  WHEN (((old.tier IS DISTINCT FROM new.tier) OR (old.billing_mode IS DISTINCT FROM new.billing_mode)))
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER set_workspace_kind_trigger
  BEFORE INSERT OR UPDATE OF name, tier, workspace_kind ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workspace_kind();

CREATE TRIGGER workspaces_default_publisher_handle
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.default_workspace_publisher_handle();

CREATE TRIGGER workspaces_ensure_settings
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_workspace_settings_row();

CREATE TRIGGER workspaces_prevent_reserved_publisher_handle
  BEFORE INSERT OR UPDATE OF publisher_handle ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_reserved_workspace_publisher_handle();

CREATE POLICY "teams: delete if owner" ON "public"."workspaces"
  FOR DELETE
  TO "authenticated"
  USING (public.is_team_owner(id));

CREATE POLICY "teams_select_own_team" ON "public"."workspaces"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(id));

CREATE POLICY "teams_update_member" ON "public"."workspaces"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(id))
  WITH CHECK (public.is_workspace_admin(id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspaces" TO "service_role";

CREATE INDEX workspaces_owner_user_id_idx ON public.workspaces USING btree (owner_user_id)
  WHERE (owner_user_id IS NOT NULL);

CREATE POLICY "teams: insert self-owned" ON "public"."workspaces"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = owner_user_id));

COMMENT ON COLUMN "public"."workspaces"."logo_url" IS 'Workspace-managed logo displayed on private catalogue resources and workspace surfaces.';

COMMENT ON COLUMN "public"."workspaces"."publisher_handle" IS 'Globally unique marketplace namespace used by public workspace resources.';

COMMENT ON COLUMN "public"."workspaces"."workspace_kind" IS 'Structural workspace persona. Commercial access remains defined by tier, billing mode, and entitlements.';

COMMENT ON TABLE "public"."workspaces" IS 'Teams (organizations) with RLS enabled. Users can only access teams they are members of.';

REVOKE ALL ON TABLE "public"."workspaces" FROM "anon";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."workspaces" TO "anon";

REVOKE ALL ON TABLE "public"."workspaces" FROM "authenticated";

REVOKE ALL ("created_at") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("created_at") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("id") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("id") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("logo_url") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("logo_url"), UPDATE ("logo_url") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("name") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("name"), UPDATE ("name") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("publisher_handle") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("publisher_handle"), UPDATE ("publisher_handle") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("slug") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("slug"), UPDATE ("slug") ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("updated_at") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("updated_at"), UPDATE ("updated_at") ON TABLE "public"."workspaces" TO "authenticated";

GRANT DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE "public"."workspaces" TO "authenticated";

REVOKE ALL ("owner_user_id") ON TABLE "public"."workspaces" FROM "authenticated";

GRANT INSERT ("owner_user_id") ON TABLE "public"."workspaces" TO "authenticated";
