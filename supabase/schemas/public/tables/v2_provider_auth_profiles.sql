CREATE TABLE "public"."v2_provider_auth_profiles" (
  "auth_profile_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"        text                     NOT NULL,
  "profile_key"          text                     NOT NULL,
  "auth_primitive_key"   text                     NOT NULL,
  "secret_reference_key" text                     NOT NULL,
  "config"               jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_provider_auth_profiles_auth_primitive_key_fkey" FOREIGN KEY (auth_primitive_key) REFERENCES public.v2_adapter_primitives(primitive_key) ON DELETE RESTRICT,
  CONSTRAINT "v2_provider_auth_profiles_config_check" CHECK ((jsonb_typeof(config) = 'object'::text)),
  CONSTRAINT "v2_provider_auth_profiles_key" UNIQUE (provider_slug, profile_key),
  CONSTRAINT "v2_provider_auth_profiles_pkey" PRIMARY KEY (auth_profile_id),
  CONSTRAINT "v2_provider_auth_profiles_provider_key" UNIQUE (provider_slug, auth_profile_id),
  CONSTRAINT "v2_provider_auth_profiles_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_provider_auth_profiles_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_provider_auth_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_provider_auth_profiles_auth_primitive_key_idx ON public.v2_provider_auth_profiles USING btree (auth_primitive_key);

CREATE POLICY "service_role_full_access" ON "public"."v2_provider_auth_profiles"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_provider_auth_profiles" TO "service_role";

COMMENT ON COLUMN "public"."v2_provider_auth_profiles"."secret_reference_key" IS 'Logical secret lookup key only. Secret values must never be stored in the control plane.';

REVOKE ALL ON TABLE "public"."v2_provider_auth_profiles" FROM "anon", "authenticated";
