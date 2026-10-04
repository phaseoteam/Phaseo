CREATE TABLE "public"."v2_provider_endpoints" (
  "provider_endpoint_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"        text                     NOT NULL,
  "endpoint_key"         text                     NOT NULL,
  "capability_id"        text                     NOT NULL,
  "base_url"             text                     NOT NULL,
  "path_template"        text                     NOT NULL,
  "api_version"          text,
  "auth_profile_id"      uuid,
  "region_code"          text,
  "service_tier_slug"    text,
  "timeout_ms"           integer                  NOT NULL DEFAULT 120000,
  "retry_policy"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_provider_endpoints_capability_key" UNIQUE (provider_slug, capability_id, provider_endpoint_id),
  CONSTRAINT "v2_provider_endpoints_key" UNIQUE (provider_slug, endpoint_key),
  CONSTRAINT "v2_provider_endpoints_pkey" PRIMARY KEY (provider_endpoint_id),
  CONSTRAINT "v2_provider_endpoints_provider_key" UNIQUE (provider_slug, provider_endpoint_id),
  CONSTRAINT "v2_provider_endpoints_provider_slug_auth_profile_id_fkey" FOREIGN KEY (provider_slug, auth_profile_id)
    REFERENCES public.v2_provider_auth_profiles(provider_slug, auth_profile_id) ON DELETE RESTRICT,
  CONSTRAINT "v2_provider_endpoints_retry_check" CHECK ((jsonb_typeof(retry_policy) = 'object'::text)),
  CONSTRAINT "v2_provider_endpoints_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'degraded'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_provider_endpoints_timeout_check" CHECK (((timeout_ms > 0) AND (timeout_ms <= 900000))),
  CONSTRAINT "v2_provider_endpoints_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_provider_endpoints_service_tier_slug_fkey" FOREIGN KEY (service_tier_slug) REFERENCES public.v2_service_tiers(service_tier_slug) ON DELETE RESTRICT,
  CONSTRAINT "canonical_capability_id" CHECK (((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))))
);

ALTER TABLE "public"."v2_provider_endpoints"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_provider_endpoints_lookup_idx ON public.v2_provider_endpoints USING btree (provider_slug, capability_id, region_code, service_tier_slug, status);

CREATE INDEX v2_provider_endpoints_provider_slug_auth_profile_id_idx ON public.v2_provider_endpoints USING btree (provider_slug, auth_profile_id);

CREATE INDEX v2_provider_endpoints_service_tier_slug_idx ON public.v2_provider_endpoints USING btree (service_tier_slug);

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_provider_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE POLICY "service_role_full_access" ON "public"."v2_provider_endpoints"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_provider_endpoints" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_provider_endpoints" FROM "anon", "authenticated";
