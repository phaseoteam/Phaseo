CREATE TABLE "public"."v2_model_provider_routes" (
  "provider_model_id"            text                     NOT NULL,
  "model_slug"                   text                     NOT NULL,
  "provider_slug"                text                     NOT NULL,
  "provider_model_slug"          text,
  "status"                       text                     NOT NULL DEFAULT 'active'::text,
  "routing_enabled"              boolean                  NOT NULL DEFAULT false,
  "input_modalities"             text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "regions"                      text[]                   NOT NULL DEFAULT '{}'::text[],
  "context_length"               integer,
  "max_output_tokens"            integer,
  "effective_from"               timestamp with time zone,
  "effective_to"                 timestamp with time zone,
  "metadata"                     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                   timestamp with time zone NOT NULL DEFAULT now(),
  "provider_availability_status" text                     NOT NULL DEFAULT 'unknown'::text,
  "phaseo_status"                text                     NOT NULL DEFAULT 'disabled'::text,
  "access_scope"                 text                     NOT NULL DEFAULT 'public'::text,
  "is_stealth"                   boolean                  NOT NULL DEFAULT false,
  "credential_mode"              text                     NOT NULL DEFAULT 'managed_and_byok'::text,
  CONSTRAINT "v2_model_provider_routes_access_scope_check" CHECK ((access_scope = ANY (ARRAY['public'::text, 'internal'::text]))),
  CONSTRAINT "v2_model_provider_routes_context_check" CHECK (((context_length IS NULL) OR (context_length > 0))),
  CONSTRAINT "v2_model_provider_routes_credential_mode_check" CHECK ((credential_mode = ANY (ARRAY['managed_and_byok'::text, 'byok_only'::text]))),
  CONSTRAINT "v2_model_provider_routes_internal_scope_check" CHECK (((access_scope = 'public'::text) OR (phaseo_status = ANY (ARRAY['testing'::text, 'enabled'::text])))),
  CONSTRAINT "v2_model_provider_routes_output_check" CHECK (((max_output_tokens IS NULL) OR (max_output_tokens > 0))),
  CONSTRAINT "v2_model_provider_routes_phaseo_routing_check" CHECK (((NOT routing_enabled) OR (phaseo_status = 'enabled'::text))),
  CONSTRAINT "v2_model_provider_routes_phaseo_status_check"
    CHECK ((phaseo_status = ANY (ARRAY['unsupported'::text, 'planned'::text, 'implementing'::text, 'testing'::text, 'enabled'::text, 'disabled'::text, 'blocked'::text]))),
  CONSTRAINT "v2_model_provider_routes_pkey" PRIMARY KEY (provider_model_id),
  CONSTRAINT "v2_model_provider_routes_provider_availability_check"
    CHECK
    ((provider_availability_status = ANY (ARRAY['unknown'::text, 'coming_soon'::text, 'preview'::text, 'available'::text, 'limited_access'::text, 'deprecated'::text,
    'removed'::text]))),
  CONSTRAINT "v2_model_provider_routes_provider_model_key" UNIQUE (provider_slug, provider_model_id),
  CONSTRAINT "v2_model_provider_routes_provider_model_slug_check" CHECK (((provider_model_slug IS NOT NULL) OR ((status = 'disabled'::text) AND (routing_enabled = false)))),
  CONSTRAINT "v2_model_provider_routes_provider_routing_check"
    CHECK (((NOT routing_enabled) OR (provider_availability_status = ANY (ARRAY['available'::text, 'preview'::text, 'limited_access'::text, 'deprecated'::text])))),
  CONSTRAINT "v2_model_provider_routes_public_routing_check" CHECK (((NOT routing_enabled) OR (access_scope = 'public'::text))),
  CONSTRAINT "v2_model_provider_routes_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'degraded'::text, 'disabled'::text, 'retired'::text]))),
  CONSTRAINT "v2_model_provider_routes_stealth_public_id_check" CHECK (((is_stealth = false) OR (provider_model_id ~~ 'stealth:%'::text))),
  CONSTRAINT "v2_model_provider_routes_window_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to > effective_from))),
  CONSTRAINT "v2_model_provider_routes_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_model_provider_routes_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_model_provider_routes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_model_provider_routes_active_idx ON public.v2_model_provider_routes USING btree (model_slug, provider_slug)
  WHERE ((status = ANY (ARRAY['active'::text, 'degraded'::text])) AND (routing_enabled = true));

CREATE INDEX v2_model_provider_routes_explicit_status_idx ON public.v2_model_provider_routes
  USING btree (model_slug, provider_availability_status, phaseo_status, access_scope, routing_enabled);

CREATE INDEX v2_model_provider_routes_model_idx ON public.v2_model_provider_routes USING btree (model_slug, status, routing_enabled);

CREATE INDEX v2_model_provider_routes_provider_idx ON public.v2_model_provider_routes USING btree (provider_slug, status, routing_enabled);

CREATE INDEX v2_model_provider_routes_stealth_idx ON public.v2_model_provider_routes USING btree (model_slug, provider_model_id)
  WHERE (is_stealth = true);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_model_provider_routes
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_model_provider_routes
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER enforce_self_serve_provider_approval
  BEFORE INSERT OR UPDATE ON public.v2_model_provider_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_self_serve_provider_approval();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_model_provider_routes
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_model_provider_routes"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING
    (((access_scope = 'public'::text) AND (is_stealth = false) AND (phaseo_status <> ALL (ARRAY['testing'::text, 'draft'::text, 'pending'::text])) AND (provider_availability_status
    <> ALL (ARRAY['not_ready'::text, 'coming_soon'::text])) AND public.catalog_model_is_public(model_slug) AND (EXISTS ( SELECT 1
   FROM public.v2_providers p
  WHERE (p.provider_slug = v2_model_provider_routes.provider_slug)))));

CREATE POLICY "v2_model_provider_routes_public_select" ON "public"."v2_model_provider_routes"
  FOR SELECT
  TO "anon", "authenticated"
  USING (((is_stealth = false) AND (status <> 'disabled'::text) AND ((effective_from IS NULL) OR (effective_from <= now())) AND ((effective_to IS NULL) OR (effective_to > now()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_model_provider_routes" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_model_provider_routes"."access_scope" IS 'Route audience. Internal routes require authenticated gateway testing mode and are never publicly routing-enabled.';

COMMENT ON COLUMN "public"."v2_model_provider_routes"."credential_mode" IS 'Optional route-level override requiring a workspace BYOK credential for this model offer.';

COMMENT ON COLUMN "public"."v2_model_provider_routes"."is_stealth" IS 'Keeps the real provider target available to internal service-role routing while every public projection exposes provider identity as exactly stealth; provider_model_id remains a synthetic stealth-prefixed identity.';

COMMENT ON COLUMN "public"."v2_model_provider_routes"."phaseo_status" IS 'Phaseo integration readiness. Only enabled routes may set routing_enabled=true.';

COMMENT ON COLUMN "public"."v2_model_provider_routes"."provider_availability_status" IS 'Upstream provider offer availability; does not imply Phaseo support.';

COMMENT ON COLUMN "public"."v2_model_provider_routes"."routing_enabled" IS 'Per provider/model routing switch, evaluated together with provider and model status.';

COMMENT ON TABLE "public"."v2_model_provider_routes" IS 'Provider/model combination anchor. Pricing, capabilities, health, and request facts reference provider_model_id.';
