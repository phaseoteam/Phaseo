CREATE TABLE "public"."v2_route_capabilities" (
  "provider_model_id" text                     NOT NULL,
  "capability_id"     text                     NOT NULL,
  "status"            text                     NOT NULL DEFAULT 'active'::text,
  "max_input_tokens"  integer,
  "max_output_tokens" integer,
  "params"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "effective_from"    timestamp with time zone,
  "effective_to"      timestamp with time zone,
  "metadata"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_route_capabilities_pkey" PRIMARY KEY (provider_model_id, capability_id),
  CONSTRAINT "v2_route_capabilities_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_route_capabilities_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'degraded'::text, 'disabled'::text, 'internal_testing'::text]))),
  CONSTRAINT "v2_route_capabilities_window_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "canonical_capability_id" CHECK ((((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))) OR ((status = 'disabled'::text) AND (effective_to IS
    NOT NULL) AND (public.canonical_routing_capability_id(capability_id) IS NOT NULL))))
);

ALTER TABLE "public"."v2_route_capabilities"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_route_capabilities_capability_idx ON public.v2_route_capabilities USING btree (capability_id, status, provider_model_id);

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_route_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_route_capabilities
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_route_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_route_capabilities
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_route_capabilities"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_model_provider_routes r
  WHERE (r.provider_model_id = v2_route_capabilities.provider_model_id))));

CREATE POLICY "v2_route_capabilities_public_select" ON "public"."v2_route_capabilities"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((status <> 'disabled'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_route_capabilities" TO "anon", "authenticated", "service_role";

COMMENT ON TABLE "public"."v2_route_capabilities" IS 'Queryable provider/model capability facts used by routing and catalogue display.';
