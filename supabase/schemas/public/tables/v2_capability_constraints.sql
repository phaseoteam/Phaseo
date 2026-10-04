CREATE TABLE "public"."v2_capability_constraints" (
  "constraint_id"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"     text,
  "provider_model_id" text,
  "capability_id"     text                     NOT NULL,
  "constraint_key"    text                     NOT NULL,
  "expression"        jsonb                    NOT NULL,
  "outcome"           text                     NOT NULL DEFAULT 'reject'::text,
  "message"           text                     NOT NULL,
  "priority"          integer                  NOT NULL DEFAULT 100,
  "status"            text                     NOT NULL DEFAULT 'draft'::text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_capability_constraints_expression_check" CHECK ((jsonb_typeof(expression) = 'object'::text)),
  CONSTRAINT "v2_capability_constraints_key" UNIQUE NULLS NOT DISTINCT (provider_slug, provider_model_id, capability_id, constraint_key),
  CONSTRAINT "v2_capability_constraints_outcome_check" CHECK ((outcome = ANY (ARRAY['reject'::text, 'warn'::text, 'transform'::text]))),
  CONSTRAINT "v2_capability_constraints_pkey" PRIMARY KEY (constraint_id),
  CONSTRAINT "v2_capability_constraints_scope_check" CHECK (((provider_slug IS NOT NULL) OR (provider_model_id IS NOT NULL))),
  CONSTRAINT "v2_capability_constraints_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'deprecated'::text, 'disabled'::text]))),
  CONSTRAINT "v2_capability_constraints_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_capability_constraints_provider_slug_provider_model_id_fkey" FOREIGN KEY (provider_slug, provider_model_id)
    REFERENCES public.v2_model_provider_routes(provider_slug, provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_capability_constraints_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_capability_constraints"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_capability_constraints_lookup_idx ON public.v2_capability_constraints USING btree (provider_slug, provider_model_id, capability_id, status, priority);

CREATE INDEX v2_capability_constraints_provider_model_id_idx ON public.v2_capability_constraints USING btree (provider_model_id);

CREATE POLICY "service_role_full_access" ON "public"."v2_capability_constraints"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_capability_constraints" TO "service_role";

COMMENT ON TABLE "public"."v2_capability_constraints" IS 'Declarative compatibility rules interpreted by an allowlisted, fail-closed expression engine.';

REVOKE ALL ON TABLE "public"."v2_capability_constraints" FROM "anon", "authenticated";
