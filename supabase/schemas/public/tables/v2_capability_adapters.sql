CREATE TABLE "public"."v2_capability_adapters" (
  "capability_adapter_id" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "capability_id"         text                     NOT NULL,
  "adapter_key"           text                     NOT NULL,
  "adapter_version"       integer                  NOT NULL DEFAULT 1,
  "primitive_bindings"    jsonb                    NOT NULL,
  "default_config"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"                text                     NOT NULL DEFAULT 'draft'::text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_capability_adapters_adapter_key_check" CHECK ((adapter_key ~ '^[a-z0-9][a-z0-9._-]*$'::text)),
  CONSTRAINT "v2_capability_adapters_bindings_check" CHECK ((jsonb_typeof(primitive_bindings) = 'object'::text)),
  CONSTRAINT "v2_capability_adapters_capability_key" UNIQUE (capability_id, capability_adapter_id),
  CONSTRAINT "v2_capability_adapters_config_check" CHECK ((jsonb_typeof(default_config) = 'object'::text)),
  CONSTRAINT "v2_capability_adapters_key" UNIQUE (adapter_key, adapter_version),
  CONSTRAINT "v2_capability_adapters_pkey" PRIMARY KEY (capability_adapter_id),
  CONSTRAINT "v2_capability_adapters_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_capability_adapters_version_check" CHECK ((adapter_version > 0)),
  CONSTRAINT "canonical_capability_id" CHECK (((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))))
);

ALTER TABLE "public"."v2_capability_adapters"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_capability_adapters_lookup_idx ON public.v2_capability_adapters USING btree (capability_id, status, adapter_key, adapter_version DESC);

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_capability_adapters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE POLICY "service_role_full_access" ON "public"."v2_capability_adapters"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_capability_adapters" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_capability_adapters" FROM "anon", "authenticated";
