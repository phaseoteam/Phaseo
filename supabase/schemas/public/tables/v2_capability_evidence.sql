CREATE TABLE "public"."v2_capability_evidence" (
  "evidence_id"       uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"     text,
  "provider_model_id" text,
  "capability_id"     text                     NOT NULL,
  "parameter_key"     text,
  "source_url"        text                     NOT NULL,
  "source_type"       text                     NOT NULL DEFAULT 'official_docs'::text,
  "checked_at"        timestamp with time zone NOT NULL,
  "confidence"        text                     NOT NULL DEFAULT 'confirmed'::text,
  "source_hash"       text,
  "notes"             text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_capability_evidence_confidence_check" CHECK ((confidence = ANY (ARRAY['confirmed'::text, 'high'::text, 'medium'::text, 'low'::text]))),
  CONSTRAINT "v2_capability_evidence_pkey" PRIMARY KEY (evidence_id),
  CONSTRAINT "v2_capability_evidence_scope_check" CHECK (((provider_slug IS NOT NULL) OR (provider_model_id IS NOT NULL))),
  CONSTRAINT "v2_capability_evidence_source_check" CHECK ((source_url ~ '^https://'::text)),
  CONSTRAINT "v2_capability_evidence_type_check"
    CHECK ((source_type = ANY (ARRAY['official_docs'::text, 'official_sdk'::text, 'live_test'::text, 'provider_support'::text, 'inference'::text]))),
  CONSTRAINT "v2_capability_evidence_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_capability_evidence_provider_slug_provider_model_id_fkey" FOREIGN KEY (provider_slug, provider_model_id)
    REFERENCES public.v2_model_provider_routes(provider_slug, provider_model_id) ON DELETE CASCADE,
  CONSTRAINT "v2_capability_evidence_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  CONSTRAINT "canonical_capability_id" CHECK (((public.canonical_routing_capability_id(capability_id) IS
    NOT NULL) AND (capability_id = public.canonical_routing_capability_id(capability_id))))
);

ALTER TABLE "public"."v2_capability_evidence"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_capability_evidence_lookup_idx ON public.v2_capability_evidence USING btree (provider_slug, provider_model_id, capability_id, checked_at DESC);

CREATE INDEX v2_capability_evidence_provider_model_id_idx ON public.v2_capability_evidence USING btree (provider_model_id);

CREATE TRIGGER canonical_routing_capability
  BEFORE INSERT OR UPDATE ON public.v2_capability_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_canonical_routing_capability();

CREATE POLICY "service_role_full_access" ON "public"."v2_capability_evidence"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_capability_evidence" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_capability_evidence" FROM "anon", "authenticated";
