CREATE TABLE "public"."gateway_dynamic_route_versions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "route_id"   uuid                     NOT NULL,
  "version"    integer                  NOT NULL,
  "config"     jsonb                    NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_dynamic_route_versions_config_check" CHECK (((jsonb_typeof(config) = 'object'::text) AND (pg_column_size(config) <= 65536))),
  CONSTRAINT "gateway_dynamic_route_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_dynamic_route_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_dynamic_route_versions_route_version_key" UNIQUE (route_id, VERSION),
  CONSTRAINT "gateway_dynamic_route_versions_version_check" CHECK ((version > 0)),
  CONSTRAINT "gateway_dynamic_route_versions_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.gateway_dynamic_routes(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_dynamic_route_versions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_dynamic_route_versions_created_by_idx ON public.gateway_dynamic_route_versions USING btree (created_by);

CREATE INDEX gateway_dynamic_route_versions_route_idx ON public.gateway_dynamic_route_versions USING btree (route_id, VERSION DESC);

CREATE POLICY "gateway_dynamic_route_versions_workspace_delete" ON "public"."gateway_dynamic_route_versions"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_versions.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))));

CREATE POLICY "gateway_dynamic_route_versions_workspace_insert" ON "public"."gateway_dynamic_route_versions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_versions.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))));

CREATE POLICY "gateway_dynamic_route_versions_workspace_select" ON "public"."gateway_dynamic_route_versions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_versions.route_id) AND ( SELECT public.is_workspace_member(route.workspace_id) AS is_workspace_member)))));

CREATE POLICY "gateway_dynamic_route_versions_workspace_update" ON "public"."gateway_dynamic_route_versions"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_versions.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_versions.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_dynamic_route_versions" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_dynamic_route_versions" IS 'Immutable dynamic route drafts and deployment history.';
