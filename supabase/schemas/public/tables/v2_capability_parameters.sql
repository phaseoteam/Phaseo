CREATE TABLE "public"."v2_capability_parameters" (
  "capability_id" text  NOT NULL,
  "parameter_key" text  NOT NULL,
  "value_schema"  jsonb NOT NULL DEFAULT '{}'::jsonb,
  "description"   text,
  CONSTRAINT "v2_capability_parameters_key_check" CHECK ((parameter_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'::text)),
  CONSTRAINT "v2_capability_parameters_pkey" PRIMARY KEY (capability_id, parameter_key),
  CONSTRAINT "v2_capability_parameters_schema_check" CHECK ((jsonb_typeof(value_schema) = 'object'::text)),
  CONSTRAINT "canonical_capability_id" CHECK (((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))))
);

ALTER TABLE "public"."v2_capability_parameters"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_capability_parameters
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE POLICY "service_role_full_access" ON "public"."v2_capability_parameters"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_capability_parameters" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_capability_parameters" FROM "anon", "authenticated";
