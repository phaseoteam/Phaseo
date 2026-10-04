CREATE TABLE "public"."workspace_settings" (
  "workspace_id"                                 uuid                     NOT NULL,
  "routing_mode"                                 text                     NOT NULL DEFAULT 'balanced'::text,
  "created_at"                                   timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"                                   timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "byok_fallback_enabled"                        boolean                  NOT NULL DEFAULT true,
  "beta_channel_enabled"                         boolean                  NOT NULL DEFAULT false,
  "privacy_enable_paid_may_train"                boolean                  NOT NULL DEFAULT true,
  "privacy_enable_free_may_train"                boolean                  NOT NULL DEFAULT true,
  "privacy_enable_free_may_publish_prompts"      boolean                  NOT NULL DEFAULT true,
  "privacy_enable_input_output_logging"          boolean                  NOT NULL DEFAULT true,
  "privacy_zdr_only"                             boolean                  NOT NULL DEFAULT false,
  "provider_restriction_mode"                    text                     NOT NULL DEFAULT 'none'::text,
  "provider_restriction_provider_ids"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "provider_restriction_enforce_allowed"         boolean                  NOT NULL DEFAULT false,
  "sso_enabled"                                  boolean                  NOT NULL DEFAULT false,
  "sso_enforced"                                 boolean                  NOT NULL DEFAULT false,
  "sso_mode"                                     text                     NOT NULL DEFAULT 'none'::text,
  "sso_provider_identifier"                      text,
  "sso_domains"                                  text[]                   NOT NULL DEFAULT '{}'::text[],
  "alpha_channel_enabled"                        boolean                  NOT NULL DEFAULT false,
  "gateway_plugins"                              jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "io_logging_enabled"                           boolean                  NOT NULL DEFAULT false,
  "io_logging_retention_days"                    integer                  NOT NULL DEFAULT 90,
  "io_logging_include_provider_payloads"         boolean                  NOT NULL DEFAULT true,
  "io_logging_updated_at"                        timestamp with time zone,
  "data_contribution_enabled"                    boolean                  NOT NULL DEFAULT false,
  "data_contribution_policy_version"             text,
  "data_contribution_consented_at"               timestamp with time zone,
  "data_contribution_consented_by"               uuid,
  "data_contribution_sample_rate_bps"            integer                  NOT NULL DEFAULT 10000,
  "data_contribution_classifier_sample_rate_bps" integer                  NOT NULL DEFAULT 1000,
  "data_contribution_discount_bps"               integer                  NOT NULL DEFAULT 100,
  "response_healing_enabled"                     boolean                  NOT NULL DEFAULT false,
  "response_healing_locked"                      boolean                  NOT NULL DEFAULT false,
  "response_healing_mode"                        text                     NOT NULL DEFAULT 'safe'::text,
  "cache_aware_routing_enabled"                  boolean                  NOT NULL DEFAULT true,
  "low_balance_email_enabled"                    boolean                  NOT NULL DEFAULT false,
  "low_balance_email_threshold_nanos"            bigint                   NOT NULL DEFAULT 0,
  "low_balance_email_last_sent_at"               timestamp with time zone,
  "low_balance_email_last_sent_balance_nanos"    bigint,
  "auto_top_up_failure_email_enabled"            boolean                  NOT NULL DEFAULT true,
  "payment_method_expiring_email_enabled"        boolean                  NOT NULL DEFAULT true,
  "model_restriction_mode"                       text                     NOT NULL DEFAULT 'none'::text,
  "model_restriction_model_ids"                  text[]                   NOT NULL DEFAULT '{}'::text[],
  "io_logging_billing_status"                    text                     NOT NULL DEFAULT 'active'::text,
  "io_logging_grace_until"                       timestamp with time zone,
  "io_logging_last_billed_at"                    timestamp with time zone,
  "io_logging_last_billing_warning_at"           timestamp with time zone,
  "io_logging_last_billing_warning_kind"         text,
  "io_logging_price_per_million_units_nanos"     bigint                   NOT NULL DEFAULT 0,
  "model_deprecation_alerts_enabled"             boolean                  NOT NULL DEFAULT false,
  "auto_routing_allowed_patterns"                text[]                   NOT NULL DEFAULT '{}'::text[],
  "auto_routing_spend_profile"                   text                     NOT NULL DEFAULT 'standard'::text,
  "auto_routing_max_input_price_per_million"     numeric,
  "auto_routing_max_output_price_per_million"    numeric,
  "auto_routing_objective"                       text                     NOT NULL DEFAULT 'balanced'::text,
  "auto_routing_fallbacks_enabled"               boolean                  NOT NULL DEFAULT true,
  "auto_routing_revision"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "auto_routing_updated_at"                      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_settings_alpha_requires_beta_channel_check" CHECK (((alpha_channel_enabled = false) OR (beta_channel_enabled = true))),
  CONSTRAINT "workspace_settings_auto_routing_custom_prices_valid" CHECK (((auto_routing_spend_profile <> 'custom'::text) OR ((auto_routing_max_input_price_per_million IS
    NOT NULL) AND (auto_routing_max_input_price_per_million >= (0)::numeric) AND (auto_routing_max_output_price_per_million IS
    NOT NULL) AND (auto_routing_max_output_price_per_million >= (0)::numeric)))),
  CONSTRAINT "workspace_settings_auto_routing_objective_valid" CHECK ((auto_routing_objective = ANY (ARRAY['balanced'::text, 'quality'::text, 'cost'::text, 'latency'::text]))),
  CONSTRAINT "workspace_settings_auto_routing_pattern_count_valid" CHECK ((cardinality(auto_routing_allowed_patterns) <= 16)),
  CONSTRAINT "workspace_settings_auto_routing_spend_profile_valid"
    CHECK ((auto_routing_spend_profile = ANY (ARRAY['economy'::text, 'standard'::text, 'premium'::text, 'unrestricted'::text, 'custom'::text]))),
  CONSTRAINT "workspace_settings_data_contribution_classifier_sample_rate_che"
    CHECK (((data_contribution_classifier_sample_rate_bps >= 0) AND (data_contribution_classifier_sample_rate_bps <= 10000))),
  CONSTRAINT "workspace_settings_data_contribution_consent_check" CHECK (((NOT data_contribution_enabled) OR ((data_contribution_policy_version IS
    NOT NULL) AND (data_contribution_consented_at IS NOT NULL)))),
  CONSTRAINT "workspace_settings_data_contribution_consented_by_fkey" FOREIGN KEY (data_contribution_consented_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_settings_data_contribution_discount_check" CHECK (((data_contribution_discount_bps >= 0) AND (data_contribution_discount_bps <= 10000))),
  CONSTRAINT "workspace_settings_data_contribution_sample_rate_check" CHECK (((data_contribution_sample_rate_bps >= 0) AND (data_contribution_sample_rate_bps <= 10000))),
  CONSTRAINT "workspace_settings_io_logging_billing_status_check" CHECK ((io_logging_billing_status = ANY (ARRAY['active'::text, 'grace'::text, 'suspended'::text]))),
  CONSTRAINT "workspace_settings_io_logging_price_per_million_units_check" CHECK ((io_logging_price_per_million_units_nanos >= 0)),
  CONSTRAINT "workspace_settings_io_logging_retention_days_check" CHECK (((io_logging_retention_days >= 90) AND (io_logging_retention_days <= 365))),
  CONSTRAINT "workspace_settings_low_balance_threshold_nonnegative" CHECK ((low_balance_email_threshold_nanos >= 0)),
  CONSTRAINT "workspace_settings_model_restriction_mode_valid" CHECK ((model_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_settings_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_settings_provider_restriction_mode_check" CHECK ((provider_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_settings_response_healing_mode_check" CHECK ((response_healing_mode = ANY (ARRAY['safe'::text, 'strict'::text]))),
  CONSTRAINT "workspace_settings_sso_mode_check" CHECK ((sso_mode = ANY (ARRAY['none'::text, 'saml'::text, 'custom_oidc'::text]))),
  CONSTRAINT "workspace_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_settings_data_contribution_actor_idx ON public.workspace_settings USING btree (data_contribution_consented_by)
  WHERE (data_contribution_consented_by IS NOT NULL);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER protect_data_contribution_settings
  BEFORE INSERT OR UPDATE ON public.workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_data_contribution_settings();

CREATE POLICY "team_settings_insert_own_team" ON "public"."workspace_settings"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_settings_select_own_team" ON "public"."workspace_settings"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "team_settings_update_own_team" ON "public"."workspace_settings"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_settings" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."workspace_settings"."auto_routing_allowed_patterns" IS 'Optional glob patterns that narrow the managed phaseo/auto text-model universe.';

COMMENT ON COLUMN "public"."workspace_settings"."auto_routing_revision" IS 'Immutable revision identifier replaced whenever the auto-routing configuration changes.';

COMMENT ON COLUMN "public"."workspace_settings"."auto_routing_spend_profile" IS 'Hard price-ceiling profile applied before phaseo/auto scores candidates.';

COMMENT ON COLUMN "public"."workspace_settings"."auto_top_up_failure_email_enabled" IS 'Email the workspace owner when an automatic credit top-up cannot be completed.';

COMMENT ON COLUMN "public"."workspace_settings"."data_contribution_classifier_sample_rate_bps" IS 'Independent upstream classifier submission rate in basis points. Platform controlled; initially 1000 (10%).';

COMMENT ON COLUMN "public"."workspace_settings"."data_contribution_discount_bps" IS 'Discount applied to eligible non-BYOK request charges in basis points. Platform controlled; initially 100 (1%).';

COMMENT ON COLUMN "public"."workspace_settings"."data_contribution_enabled" IS 'Explicit workspace opt-in to contribute a deterministic sample of prompts and completions for a billing discount.';

COMMENT ON COLUMN "public"."workspace_settings"."data_contribution_sample_rate_bps" IS 'Deterministic redacted I/O retention rate in basis points. Platform controlled; initially 10000 (100%).';

COMMENT ON COLUMN "public"."workspace_settings"."io_logging_billing_status" IS 'Extended-retention state consumed by the gateway I/O logging path.';

COMMENT ON COLUMN "public"."workspace_settings"."io_logging_price_per_million_units_nanos" IS 'Reserved extended-retention price override; zero uses the default.';

COMMENT ON COLUMN "public"."workspace_settings"."model_restriction_model_ids" IS 'Canonical API model slugs used by the workspace-wide model restriction mode.';

COMMENT ON COLUMN "public"."workspace_settings"."payment_method_expiring_email_enabled" IS 'Email the workspace owner before a saved card used for billing expires.';
