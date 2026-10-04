CREATE TABLE "public"."gateway_dynamic_route_keys" (
  "route_id"    uuid                     NOT NULL,
  "key_id"      uuid                     NOT NULL,
  "attached_by" uuid,
  "attached_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_dynamic_route_keys_attached_by_fkey" FOREIGN KEY (attached_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_dynamic_route_keys_one_route_per_key" UNIQUE (key_id),
  CONSTRAINT "gateway_dynamic_route_keys_pkey" PRIMARY KEY (route_id, key_id),
  CONSTRAINT "gateway_dynamic_route_keys_route_id_fkey" FOREIGN KEY (route_id) REFERENCES public.gateway_dynamic_routes(id) ON DELETE CASCADE,
  CONSTRAINT "gateway_dynamic_route_keys_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_dynamic_route_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_dynamic_route_keys_attached_by_idx ON public.gateway_dynamic_route_keys USING btree (attached_by);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.gateway_dynamic_route_keys
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE POLICY "gateway_dynamic_route_keys_workspace_delete" ON "public"."gateway_dynamic_route_keys"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_keys.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))));

CREATE POLICY "gateway_dynamic_route_keys_workspace_insert" ON "public"."gateway_dynamic_route_keys"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.gateway_dynamic_routes route
     JOIN public.keys gateway_key ON ((gateway_key.id = gateway_dynamic_route_keys.key_id)))
  WHERE
    ((route.id = gateway_dynamic_route_keys.route_id) AND (gateway_key.workspace_id = route.workspace_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS
    is_workspace_admin)))));

CREATE POLICY "gateway_dynamic_route_keys_workspace_select" ON "public"."gateway_dynamic_route_keys"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_keys.route_id) AND ( SELECT public.is_workspace_member(route.workspace_id) AS is_workspace_member)))));

CREATE POLICY "gateway_dynamic_route_keys_workspace_update" ON "public"."gateway_dynamic_route_keys"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.gateway_dynamic_routes route
  WHERE ((route.id = gateway_dynamic_route_keys.route_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS is_workspace_admin)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.gateway_dynamic_routes route
     JOIN public.keys gateway_key ON ((gateway_key.id = gateway_dynamic_route_keys.key_id)))
  WHERE
    ((route.id = gateway_dynamic_route_keys.route_id) AND (gateway_key.workspace_id = route.workspace_id) AND ( SELECT public.is_workspace_admin(route.workspace_id) AS
    is_workspace_admin)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_dynamic_route_keys" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."gateway_dynamic_route_keys" IS 'Attaches at most one active dynamic route to each inference API key.';
