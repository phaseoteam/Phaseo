CREATE TABLE "public"."v2_capability_parameters" (
  "capability_id" text  NOT NULL,
  "parameter_key" text  NOT NULL,
  "value_schema"  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "description"   text,
  CONSTRAINT "v2_capability_parameters_key_check" CHECK ((parameter_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'::text)),
  CONSTRAINT "v2_capability_parameters_pkey" PRIMARY KEY (capability_id, parameter_key),
  CONSTRAINT "v2_capability_parameters_schema_check" CHECK ((jsonb_typeof(value_schema) = 'object'::text))
);

ALTER TABLE "public"."v2_capability_parameters"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."v2_capability_parameters"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_capability_parameters" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_capability_parameters" FROM "anon", "authenticated";
