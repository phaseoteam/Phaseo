CREATE TABLE "public"."v2_execution_plans" (
  "execution_plan_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "release_id"        uuid                     NOT NULL,
  "provider_model_id" text                     NOT NULL,
  "capability_id"     text                     NOT NULL,
  "route_variant_id"  uuid,
  "plan_version"      integer                  NOT NULL DEFAULT 1,
  "plan_hash"         text                     NOT NULL,
  "plan"              jsonb                    NOT NULL,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_execution_plans_key" UNIQUE NULLS NOT DISTINCT (release_id, provider_model_id, capability_id, route_variant_id),
  CONSTRAINT "v2_execution_plans_pkey" PRIMARY KEY (execution_plan_id),
  CONSTRAINT "v2_execution_plans_plan_check" CHECK ((jsonb_typeof(plan) = 'object'::text)),
  CONSTRAINT "v2_execution_plans_release_id_fkey" FOREIGN KEY (release_id) REFERENCES public.v2_control_plane_releases(release_id) ON DELETE CASCADE,
  CONSTRAINT "v2_execution_plans_version_check" CHECK ((plan_version > 0)),
  CONSTRAINT "v2_execution_plans_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_execution_plans_provider_model_id_capability_id_fkey" FOREIGN KEY (provider_model_id, capability_id)
    REFERENCES public.v2_route_capabilities(provider_model_id, capability_id) ON DELETE CASCADE,
  CONSTRAINT "v2_execution_plans_provider_model_id_route_variant_id_fkey" FOREIGN KEY (provider_model_id, route_variant_id)
    REFERENCES public.v2_route_variants(provider_model_id, variant_id) ON DELETE CASCADE,
  CONSTRAINT "canonical_capability_id" CHECK (((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))))
);

ALTER TABLE "public"."v2_execution_plans"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_execution_plans_provider_model_id_capability_id_idx ON public.v2_execution_plans USING btree (provider_model_id, capability_id);

CREATE INDEX v2_execution_plans_provider_model_id_route_variant_id_idx ON public.v2_execution_plans USING btree (provider_model_id, route_variant_id);

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_execution_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE TRIGGER prevent_published_execution_plan_mutation
  BEFORE INSERT OR DELETE OR UPDATE ON public.v2_execution_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_published_execution_plan_mutation();

CREATE POLICY "service_role_full_access" ON "public"."v2_execution_plans"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_execution_plans" TO "service_role";

COMMENT ON TABLE "public"."v2_execution_plans" IS 'Immutable, compiled data-plane input. Gateway runtime must not interpret draft control-plane rows.';

REVOKE ALL ON TABLE "public"."v2_execution_plans" FROM "anon", "authenticated";
