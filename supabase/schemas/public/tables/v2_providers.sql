CREATE TABLE "public"."v2_providers" (
  "provider_slug"                              text                     NOT NULL,
  "lab_slug"                                   text,
  "name"                                       text                     NOT NULL,
  "status"                                     text                     NOT NULL DEFAULT 'active'::text,
  "routing_enabled"                            boolean                  NOT NULL DEFAULT false,
  "routable"                                   boolean                  NOT NULL DEFAULT false,
  "country_code"                               text                     NOT NULL DEFAULT 'xx'::text,
  "base_url"                                   text,
  "metadata"                                   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                                 timestamp with time zone NOT NULL DEFAULT now(),
  "provider_family_slug"                       text,
  "offer_scope"                                text                     NOT NULL DEFAULT 'global'::text,
  "offer_label"                                text,
  "residency_mode"                             text                     NOT NULL DEFAULT 'unknown'::text,
  "default_execution_regions"                  text[],
  "default_data_regions"                       text[],
  "zero_data_retention"                        boolean                  NOT NULL DEFAULT false,
  "prompt_training_policy"                     text                     NOT NULL DEFAULT 'unknown'::text,
  "data_policy_tier"                           text                     NOT NULL DEFAULT 'unknown'::text,
  "data_policy_confidence"                     text                     NOT NULL DEFAULT 'unknown'::text,
  "data_policy_contract_mode"                  text                     NOT NULL DEFAULT 'none'::text,
  "data_policy_variant"                        text                     NOT NULL DEFAULT 'standard'::text,
  "stream_cancellation_support"                text                     NOT NULL DEFAULT 'unknown'::text,
  "stream_cancellation_stops_provider_billing" boolean,
  "stream_cancellation_usage_recovery"         text                     NOT NULL DEFAULT 'unknown'::text,
  "stream_cancellation_evidence_kind"          text                     NOT NULL DEFAULT 'none'::text,
  "stream_cancellation_source_url"             text,
  "stream_cancellation_verified_at"            timestamp with time zone,
  "data_retention_days"                        integer,
  "byok_available"                             boolean                  NOT NULL DEFAULT false,
  "subdivision_code"                           text,
  "credential_mode"                            text                     NOT NULL DEFAULT 'managed_and_byok'::text,
  CONSTRAINT "v2_providers_credential_mode_check" CHECK ((credential_mode = ANY (ARRAY['managed_and_byok'::text, 'byok_only'::text]))),
  CONSTRAINT "v2_providers_data_policy_confidence_check" CHECK ((data_policy_confidence = ANY (ARRAY['unknown'::text, 'confirmed'::text, 'maybe'::text]))),
  CONSTRAINT "v2_providers_data_policy_contract_mode_check"
    CHECK ((data_policy_contract_mode = ANY (ARRAY['none'::text, 'customer_agreement'::text, 'enterprise_agreement'::text]))),
  CONSTRAINT "v2_providers_data_policy_tier_check" CHECK ((data_policy_tier = ANY (ARRAY['unknown'::text, 'private'::text, 'logs'::text, 'trains'::text]))),
  CONSTRAINT "v2_providers_data_policy_variant_check" CHECK ((data_policy_variant = ANY (ARRAY['standard'::text, 'zdr'::text]))),
  CONSTRAINT "v2_providers_data_retention_days_check" CHECK (((data_retention_days IS NULL) OR (data_retention_days >= 0))),
  CONSTRAINT "v2_providers_lab_slug_fkey" FOREIGN KEY (lab_slug) REFERENCES public.v2_labs(lab_slug) ON DELETE SET NULL,
  CONSTRAINT "v2_providers_offer_scope_check" CHECK ((offer_scope = ANY (ARRAY['global'::text, 'regional'::text, 'specialized'::text]))),
  CONSTRAINT "v2_providers_pkey" PRIMARY KEY (provider_slug),
  CONSTRAINT "v2_providers_residency_mode_check"
    CHECK ((residency_mode = ANY (ARRAY['unknown'::text, 'provider_managed'::text, 'customer_selectable'::text, 'account_selected'::text]))),
  CONSTRAINT "v2_providers_slug_check" CHECK (((provider_slug = lower(provider_slug)) AND (provider_slug ~ '^[a-z0-9][a-z0-9._-]*$'::text))),
  CONSTRAINT "v2_providers_status_check"
    CHECK ((status = ANY (ARRAY['active'::text, 'beta'::text, 'alpha'::text, 'not_ready'::text, 'deprecated'::text, 'disabled'::text, 'external'::text]))),
  CONSTRAINT "v2_providers_stream_cancel_billing_check"
    CHECK (((stream_cancellation_stops_provider_billing IS DISTINCT FROM true) OR (stream_cancellation_support = 'supported'::text))),
  CONSTRAINT "v2_providers_stream_cancel_evidence_check" CHECK ((stream_cancellation_evidence_kind = ANY (ARRAY['provider'::text, 'aggregator'::text, 'none'::text]))),
  CONSTRAINT "v2_providers_stream_cancel_support_check" CHECK ((stream_cancellation_support = ANY (ARRAY['supported'::text, 'unsupported'::text, 'unknown'::text]))),
  CONSTRAINT "v2_providers_stream_cancel_usage_check" CHECK ((stream_cancellation_usage_recovery = ANY (ARRAY['authoritative'::text, 'unknown'::text]))),
  CONSTRAINT "v2_providers_subdivision_code_check"
    CHECK
    (((subdivision_code IS NULL) OR ((subdivision_code = upper(btrim(subdivision_code))) AND (subdivision_code ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'::text) AND ((lower(btrim(country_code))
    = 'xx'::text) OR (split_part(subdivision_code, '-'::text, 1) = upper(btrim(country_code))))))),
  CONSTRAINT "v2_providers_zdr_variant_integrity_check"
    CHECK
    (((data_policy_variant <> 'zdr'::text) OR ((offer_scope = 'specialized'::text) AND (zero_data_retention IS TRUE) AND (data_policy_tier = 'private'::text) AND
    (data_policy_confidence = 'confirmed'::text)))),
  CONSTRAINT "v2_providers_zero_data_retention_check" CHECK ((zero_data_retention = ANY (ARRAY[true, false])))
);

ALTER TABLE "public"."v2_providers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_providers_lab_idx ON public.v2_providers USING btree (lab_slug);

CREATE INDEX v2_providers_policy_variant_idx ON public.v2_providers USING btree (provider_family_slug, data_policy_variant, offer_scope)
  WHERE (status <> ALL (ARRAY['disabled'::text, 'deprecated'::text]));

CREATE INDEX v2_providers_routing_idx ON public.v2_providers USING btree (status, routing_enabled, routable)
  WHERE (status <> ALL (ARRAY['disabled'::text, 'deprecated'::text]));

CREATE INDEX v2_providers_subdivision_idx ON public.v2_providers USING btree (subdivision_code)
  WHERE (subdivision_code IS NOT NULL);

CREATE TRIGGER catalogue_no_removal
  BEFORE DELETE OR TRUNCATE ON public.v2_providers
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_catalogue_removal();

CREATE TRIGGER catalogue_row_history
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_providers
  FOR EACH ROW
  EXECUTE FUNCTION catalogue_private.record_row_history();

CREATE TRIGGER enforce_self_serve_provider_review_routing
  BEFORE INSERT OR UPDATE ON public.v2_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_self_serve_provider_review_routing();

CREATE TRIGGER routing_catalogue_changed
  AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.v2_providers
  FOR EACH STATEMENT
  EXECUTE FUNCTION private.invalidate_routing_catalogue();

CREATE POLICY "provider_catalog_public_guard" ON "public"."v2_providers"
  AS RESTRICTIVE
  FOR SELECT
  TO "anon", "authenticated"
  USING
    (((status <> ALL (ARRAY['not_ready'::text, 'coming_soon'::text, 'testing'::text, 'draft'::text, 'pending'::text])) AND (NOT (COALESCE(metadata, '{}'::jsonb) ?
    'self_serve'::text))));

CREATE POLICY "v2_providers_public_select" ON "public"."v2_providers"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((status <> 'disabled'::text));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_providers" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_providers"."byok_available" IS 'Whether Phaseo currently supports bringing a provider credential for this provider.';

COMMENT ON COLUMN "public"."v2_providers"."credential_mode" IS 'Whether Phaseo may use managed provider credentials or must use a workspace BYOK credential.';

COMMENT ON COLUMN "public"."v2_providers"."data_policy_variant" IS 'Policy-specific provider route. ZDR variants are separate provider rows and must guarantee ZDR by default.';

COMMENT ON COLUMN "public"."v2_providers"."data_retention_days" IS 'Published prompt/input-output retention period in days; null means unknown or variable and zero means no documented retention.';

COMMENT ON COLUMN "public"."v2_providers"."routable" IS 'Legacy provider-level routing flag. External providers require a route-level metadata.external_routing_override opt-in.';

COMMENT ON COLUMN "public"."v2_providers"."routing_enabled" IS 'Global provider routing switch; effective routing also requires the route-level switch.';

COMMENT ON COLUMN "public"."v2_providers"."status" IS 'Provider lifecycle/routing status. external identifies providers that are shown as external and remain non-routable unless explicitly opted in.';

COMMENT ON COLUMN "public"."v2_providers"."stream_cancellation_stops_provider_billing" IS 'Whether provider processing and provider billing are evidenced to stop after cancellation.';

COMMENT ON COLUMN "public"."v2_providers"."stream_cancellation_support" IS 'Whether the provider is evidenced to accept stream cancellation. Unknown fails closed.';

COMMENT ON COLUMN "public"."v2_providers"."stream_cancellation_usage_recovery" IS 'Whether Phaseo can recover authoritative usage after cancellation. Required before cancel_upstream is enabled.';

COMMENT ON COLUMN "public"."v2_providers"."subdivision_code" IS 'Primary provider location as an ISO 3166-2 subdivision code, for example US-CA.';

COMMENT ON COLUMN "public"."v2_providers"."zero_data_retention" IS 'Whether this exact provider offer guarantees zero request-content retention by default. False means ZDR is not guaranteed; it does not mean another offer cannot provide ZDR.';
