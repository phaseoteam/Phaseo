CREATE TABLE "public"."v2_adapter_primitives" (
  "primitive_key"  text                     NOT NULL,
  "primitive_kind" text                     NOT NULL,
  "code_version"   integer                  NOT NULL DEFAULT 1,
  "config_schema"  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "status"         text                     NOT NULL DEFAULT 'active'::text,
  "description"    text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_adapter_primitives_key_check" CHECK ((primitive_key ~ '^[a-z0-9][a-z0-9._-]*$'::text)),
  CONSTRAINT "v2_adapter_primitives_kind_check"
    CHECK
    ((primitive_kind = ANY (ARRAY['request_mapper'::text, 'response_parser'::text, 'stream_parser'::text, 'auth_signer'::text, 'transport'::text, 'usage_normalizer'::text,
    'error_normalizer'::text, 'job_handler'::text]))),
  CONSTRAINT "v2_adapter_primitives_pkey" PRIMARY KEY (primitive_key),
  CONSTRAINT "v2_adapter_primitives_schema_check" CHECK ((jsonb_typeof(config_schema) = 'object'::text)),
  CONSTRAINT "v2_adapter_primitives_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'deprecated'::text, 'disabled'::text])))
);

ALTER TABLE "public"."v2_adapter_primitives"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."v2_adapter_primitives"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_adapter_primitives" TO "service_role";

COMMENT ON TABLE "public"."v2_adapter_primitives" IS 'Allowlisted, code-owned protocol mechanics available to the control-plane compiler.';

REVOKE ALL ON TABLE "public"."v2_adapter_primitives" FROM "anon", "authenticated";
