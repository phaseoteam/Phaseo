CREATE TABLE "public"."gateway_dynamic_routes" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"     uuid                     NOT NULL,
  "name"             text                     NOT NULL,
  "slug"             text                     NOT NULL,
  "description"      text,
  "status"           text                     NOT NULL DEFAULT 'active'::text,
  "version"          integer                  NOT NULL DEFAULT 1,
  "deployed_version" integer,
  "config"           jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_dynamic_routes_config_check" CHECK (((jsonb_typeof(config) = 'object'::text) AND (pg_column_size(config) <= 65536))),
  CONSTRAINT "gateway_dynamic_routes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_dynamic_routes_description_check" CHECK (((description IS NULL) OR (char_length(description) <= 500))),
  CONSTRAINT "gateway_dynamic_routes_name_check" CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 80))),
  CONSTRAINT "gateway_dynamic_routes_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_dynamic_routes_slug_check" CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'::text)),
  CONSTRAINT "gateway_dynamic_routes_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text]))),
  CONSTRAINT "gateway_dynamic_routes_version_check" CHECK ((version > 0)),
  CONSTRAINT "gateway_dynamic_routes_workspace_name_key" UNIQUE (workspace_id, name),
  CONSTRAINT "gateway_dynamic_routes_workspace_slug_key" UNIQUE (workspace_id, slug),
  CONSTRAINT "gateway_dynamic_routes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_dynamic_routes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_dynamic_routes_created_by_idx ON public.gateway_dynamic_routes USING btree (created_by);

CREATE INDEX gateway_dynamic_routes_workspace_idx ON public.gateway_dynamic_routes USING btree (workspace_id, updated_at DESC);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.gateway_dynamic_routes
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "gateway_dynamic_routes_workspace_delete" ON "public"."gateway_dynamic_routes"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT public.is_workspace_admin(gateway_dynamic_routes.workspace_id) AS is_workspace_admin));

CREATE POLICY "gateway_dynamic_routes_workspace_insert" ON "public"."gateway_dynamic_routes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (( SELECT public.is_workspace_admin(gateway_dynamic_routes.workspace_id) AS is_workspace_admin));

CREATE POLICY "gateway_dynamic_routes_workspace_select" ON "public"."gateway_dynamic_routes"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(gateway_dynamic_routes.workspace_id) AS is_workspace_member));

CREATE POLICY "gateway_dynamic_routes_workspace_update" ON "public"."gateway_dynamic_routes"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT public.is_workspace_admin(gateway_dynamic_routes.workspace_id) AS is_workspace_admin))
  WITH CHECK (( SELECT public.is_workspace_admin(gateway_dynamic_routes.workspace_id) AS is_workspace_admin));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_dynamic_routes" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_dynamic_routes" IS 'Dynamic routing identities and their currently deployed immutable configuration snapshots.';
