CREATE TABLE "public"."v2_route_parameter_support" (
  "provider_model_id" text                     NOT NULL,
  "capability_id"     text                     NOT NULL,
  "parameter_key"     text                     NOT NULL,
  "support_level"     text                     NOT NULL,
  "config"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "notes"             text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_route_parameter_support_capability_id_parameter_key_fkey" FOREIGN KEY (capability_id, parameter_key)
    REFERENCES public.v2_capability_parameters(capability_id, parameter_key) ON DELETE RESTRICT,
  CONSTRAINT "v2_route_parameter_support_config_check" CHECK ((jsonb_typeof(config) = 'object'::text)),
  CONSTRAINT "v2_route_parameter_support_level_check"
    CHECK ((support_level = ANY (ARRAY['native'::text, 'emulated'::text, 'ignored'::text, 'unsupported'::text, 'unknown'::text]))),
  CONSTRAINT "v2_route_parameter_support_pkey" PRIMARY KEY (provider_model_id, capability_id, parameter_key),
  CONSTRAINT "v2_route_parameter_support_provider_model_id_capability_id_fkey" FOREIGN KEY (provider_model_id, capability_id)
    REFERENCES public.v2_route_capabilities(provider_model_id, capability_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_route_parameter_support"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_route_parameter_support_lookup_idx ON public.v2_route_parameter_support USING btree (capability_id, parameter_key, support_level, provider_model_id);

CREATE POLICY "service_role_full_access" ON "public"."v2_route_parameter_support"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_route_parameter_support" TO "service_role";

COMMENT ON TABLE "public"."v2_route_parameter_support" IS 'Truth table distinguishing native, emulated, ignored, unsupported and unknown parameter support.';

REVOKE ALL ON TABLE "public"."v2_route_parameter_support" FROM "anon", "authenticated";
