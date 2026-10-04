CREATE TABLE "public"."oauth_app_metadata" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "client_id"            text                     NOT NULL,
  "workspace_id"         uuid                     NOT NULL,
  "name"                 text                     NOT NULL,
  "description"          text,
  "homepage_url"         text,
  "logo_url"             text,
  "privacy_policy_url"   text,
  "terms_of_service_url" text,
  "created_by"           uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "redirect_uris"        text[]                   NOT NULL DEFAULT '{}'::text[],
  "client_type"          text                     NOT NULL DEFAULT 'public'::text,
  "client_secret_hash"   text,
  "allowed_scopes"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "is_first_party"       boolean                  NOT NULL DEFAULT false,
  "beta_status"          text                     NOT NULL DEFAULT 'beta'::text,
  CONSTRAINT "oauth_app_metadata_beta_status_check" CHECK ((beta_status = ANY (ARRAY['private'::text, 'beta'::text, 'public'::text]))),
  CONSTRAINT "oauth_app_metadata_client_id_key" UNIQUE (client_id),
  CONSTRAINT "oauth_app_metadata_client_type_check" CHECK ((client_type = ANY (ARRAY['public'::text, 'confidential'::text]))),
  CONSTRAINT "oauth_app_metadata_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "oauth_app_metadata_name_check" CHECK (((char_length(name) >= 3) AND (char_length(name) <= 100))),
  CONSTRAINT "oauth_app_metadata_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_app_metadata_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text]))),
  CONSTRAINT "oauth_app_metadata_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_app_metadata"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oauth_app_metadata_created_by_idx ON public.oauth_app_metadata USING btree (created_by);

CREATE INDEX oauth_app_metadata_redirect_uris_gin_idx ON public.oauth_app_metadata USING gin (redirect_uris);

CREATE INDEX oauth_app_metadata_status_idx ON public.oauth_app_metadata USING btree (status)
  WHERE (status = 'active'::text);

CREATE INDEX oauth_app_metadata_workspace_id_idx ON public.oauth_app_metadata USING btree (workspace_id);

CREATE TRIGGER update_oauth_app_metadata_updated_at_trigger
  BEFORE UPDATE ON public.oauth_app_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_oauth_app_metadata_updated_at();

CREATE POLICY "oauth_app_metadata_delete_own_team" ON "public"."oauth_app_metadata"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "oauth_app_metadata_insert_own_team" ON "public"."oauth_app_metadata"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((public.is_workspace_member(workspace_id) AND (created_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "oauth_app_metadata_select_own_team" ON "public"."oauth_app_metadata"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "oauth_app_metadata_update_own_team" ON "public"."oauth_app_metadata"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_app_metadata" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."oauth_app_metadata"."redirect_uris" IS 'Registered OAuth callback URLs for this app (mirrors Supabase OAuth client redirect_uris).';

COMMENT ON TABLE "public"."oauth_app_metadata" IS 'OAuth application metadata for third-party developer integrations. Complements Supabase OAuth client credentials.';
