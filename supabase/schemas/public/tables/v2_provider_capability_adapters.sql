CREATE TABLE "public"."v2_provider_capability_adapters" (
  "provider_capability_adapter_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"                  text                     NOT NULL,
  "capability_id"                  text                     NOT NULL,
  "capability_adapter_id"          uuid                     NOT NULL,
  "provider_endpoint_id"           uuid                     NOT NULL,
  "config"                         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"                         text                     NOT NULL DEFAULT 'draft'::text,
  "effective_from"                 timestamp with time zone,
  "effective_to"                   timestamp with time zone,
  "created_at"                     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_provider_capability_adapte_capability_id_capability_ada_fkey" FOREIGN KEY (capability_id, capability_adapter_id)
    REFERENCES public.v2_capability_adapters(capability_id, capability_adapter_id) ON DELETE RESTRICT,
  CONSTRAINT "v2_provider_capability_adapters_config_check" CHECK ((jsonb_typeof(config) = 'object'::text)),
  CONSTRAINT "v2_provider_capability_adapters_key" UNIQUE (provider_slug, capability_id, capability_adapter_id, provider_endpoint_id),
  CONSTRAINT "v2_provider_capability_adapters_pkey" PRIMARY KEY (provider_capability_adapter_id),
  CONSTRAINT "v2_provider_capability_adapters_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_provider_capability_adapters_window_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "v2_provider_capability_adapte_provider_slug_capability_id__fkey" FOREIGN KEY (provider_slug, capability_id, provider_endpoint_id)
    REFERENCES public.v2_provider_endpoints(provider_slug, capability_id, provider_endpoint_id) ON DELETE RESTRICT,
  CONSTRAINT "v2_provider_capability_adapters_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_provider_capability_adapters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_provider_capability_adapte_capability_id_capability_ada_idx ON public.v2_provider_capability_adapters USING btree (capability_id, capability_adapter_id);

CREATE INDEX v2_provider_capability_adapte_provider_slug_capability_id__idx ON public.v2_provider_capability_adapters
  USING btree (provider_slug, capability_id, provider_endpoint_id);

CREATE INDEX v2_provider_capability_adapters_lookup_idx ON public.v2_provider_capability_adapters USING btree (provider_slug, capability_id, status);

CREATE POLICY "service_role_full_access" ON "public"."v2_provider_capability_adapters"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_provider_capability_adapters" TO "service_role";

COMMENT ON TABLE "public"."v2_provider_capability_adapters" IS 'Provider-by-capability composition of adapter mechanics, endpoint and declarative policy.';

REVOKE ALL ON TABLE "public"."v2_provider_capability_adapters" FROM "anon", "authenticated";
