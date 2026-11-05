CREATE TABLE "public"."workspace_guardrails" (
  "id"                                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"                            uuid                     NOT NULL,
  "enabled"                                 boolean                  NOT NULL DEFAULT true,
  "name"                                    text                     NOT NULL,
  "description"                             text,
  "privacy_enable_paid_may_train"           boolean                  NOT NULL DEFAULT true,
  "privacy_enable_free_may_train"           boolean                  NOT NULL DEFAULT true,
  "privacy_enable_free_may_publish_prompts" boolean                  NOT NULL DEFAULT true,
  "privacy_enable_input_output_logging"     boolean                  NOT NULL DEFAULT true,
  "privacy_zdr_only"                        boolean                  NOT NULL DEFAULT false,
  "provider_restriction_mode"               text                     NOT NULL DEFAULT 'none'::text,
  "provider_restriction_provider_ids"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "provider_restriction_enforce_allowed"    boolean                  NOT NULL DEFAULT false,
  "allowed_api_model_ids"                   text[]                   NOT NULL DEFAULT '{}'::text[],
  "created_at"                              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"                              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "prompt_injection_enabled"                boolean                  NOT NULL DEFAULT false,
  "prompt_injection_action"                 text                     NOT NULL DEFAULT 'flag'::text,
  "sensitive_info_enabled"                  boolean                  NOT NULL DEFAULT false,
  "sensitive_info_default_action"           text                     NOT NULL DEFAULT 'redact'::text,
  "sensitive_info_rules"                    jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "model_restriction_mode"                  text                     NOT NULL DEFAULT 'none'::text,
  "kind"                                    text                     NOT NULL DEFAULT 'access'::text,
  "is_workspace_baseline"                   boolean                  NOT NULL DEFAULT false,
  "rate_requests_per_minute"                integer,
  "rate_tokens_per_minute"                  bigint,
  "rate_concurrent_requests"                integer,
  "rate_fail_closed"                        boolean                  NOT NULL DEFAULT false,
  "rate_counting"                           text,
  "spend_limit_nanos"                       bigint,
  "spend_period"                            text,
  "spend_action"                            text,
  "spend_counting"                          text,
  CONSTRAINT "workspace_guardrails_baseline_kind_check" CHECK (((NOT is_workspace_baseline) OR (kind = 'access'::text))),
  CONSTRAINT "workspace_guardrails_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "workspace_guardrails_kind_check" CHECK ((kind = ANY (ARRAY['access'::text, 'safety'::text, 'spend'::text, 'rate'::text]))),
  CONSTRAINT "workspace_guardrails_model_restriction_mode_check" CHECK ((model_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_guardrails_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_guardrails_prompt_injection_action_check" CHECK ((prompt_injection_action = ANY (ARRAY['flag'::text, 'redact'::text, 'block'::text]))),
  CONSTRAINT "workspace_guardrails_provider_restriction_mode_check" CHECK ((provider_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_guardrails_rate_concurrent_requests_check" CHECK (((rate_concurrent_requests IS NULL) OR (rate_concurrent_requests > 0))),
  CONSTRAINT "workspace_guardrails_rate_counting_check" CHECK (((rate_counting IS NULL) OR (rate_counting = ANY (ARRAY['shared'::text, 'each_key'::text, 'each_end_user'::text])))),
  CONSTRAINT "workspace_guardrails_rate_kind_check" CHECK ((((kind = 'rate'::text) AND (num_nonnulls(rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests) > 0) AND privacy_enable_paid_may_train AND privacy_enable_free_may_train AND privacy_enable_free_may_publish_prompts AND privacy_enable_input_output_logging AND (NOT privacy_zdr_only) AND (provider_restriction_mode = 'none'::text) AND (model_restriction_mode = 'none'::text) AND (NOT prompt_injection_enabled) AND (NOT sensitive_info_enabled)) OR ((kind <> 'rate'::text) AND (num_nonnulls(rate_requests_per_minute, rate_tokens_per_minute, rate_concurrent_requests, rate_counting) = 0) AND (NOT rate_fail_closed)))),
  CONSTRAINT "workspace_guardrails_rate_requests_per_minute_check" CHECK (((rate_requests_per_minute IS NULL) OR (rate_requests_per_minute > 0))),
  CONSTRAINT "workspace_guardrails_rate_tokens_per_minute_check" CHECK (((rate_tokens_per_minute IS NULL) OR (rate_tokens_per_minute > 0))),
  CONSTRAINT "workspace_guardrails_sensitive_info_default_action_check" CHECK ((sensitive_info_default_action = ANY (ARRAY['flag'::text, 'redact'::text, 'block'::text]))),
  CONSTRAINT "workspace_guardrails_spend_action_check" CHECK (((spend_action IS NULL) OR (spend_action = ANY (ARRAY['notify'::text, 'block'::text])))),
  CONSTRAINT "workspace_guardrails_spend_counting_check" CHECK (((spend_counting IS NULL) OR (spend_counting = ANY (ARRAY['shared'::text, 'each_key'::text])))),
  CONSTRAINT "workspace_guardrails_spend_kind_check" CHECK ((((kind = 'spend'::text) AND (num_nonnulls(spend_limit_nanos, spend_period, spend_action, spend_counting) = 4) AND privacy_enable_paid_may_train AND privacy_enable_free_may_train AND privacy_enable_free_may_publish_prompts AND privacy_enable_input_output_logging AND (NOT privacy_zdr_only) AND (provider_restriction_mode = 'none'::text) AND (model_restriction_mode = 'none'::text) AND (NOT prompt_injection_enabled) AND (NOT sensitive_info_enabled)) OR ((kind <> 'spend'::text) AND (num_nonnulls(spend_limit_nanos, spend_period, spend_action, spend_counting) = 0)))),
  CONSTRAINT "workspace_guardrails_spend_limit_nanos_check" CHECK (((spend_limit_nanos IS NULL) OR (spend_limit_nanos > 0))),
  CONSTRAINT "workspace_guardrails_spend_period_check" CHECK (((spend_period IS NULL) OR (spend_period = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])))),
  CONSTRAINT "workspace_guardrails_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_guardrails"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX workspace_guardrails_one_baseline_idx ON public.workspace_guardrails USING btree (workspace_id)
  WHERE is_workspace_baseline;

CREATE UNIQUE INDEX workspace_guardrails_rate_name_idx ON public.workspace_guardrails USING btree (workspace_id, lower(btrim(name)))
  WHERE (kind = 'rate'::text);

CREATE INDEX workspace_guardrails_workspace_id_idx ON public.workspace_guardrails USING btree (workspace_id);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER protect_slack_agent_guardrail
  BEFORE DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_slack_agent_guardrail();

CREATE TRIGGER protect_workspace_baseline_guardrail
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.protect_workspace_baseline_guardrail();

CREATE TRIGGER sync_workspace_baseline_guardrail
  AFTER INSERT OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  WHEN (new.is_workspace_baseline)
  EXECUTE FUNCTION private.sync_workspace_baseline_guardrail();

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_guardrails"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "team_guardrails_delete_own_team" ON "public"."workspace_guardrails"
  FOR DELETE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_guardrails_insert_own_team" ON "public"."workspace_guardrails"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY "team_guardrails_select_own_team" ON "public"."workspace_guardrails"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "team_guardrails_update_own_team" ON "public"."workspace_guardrails"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_guardrails" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."workspace_guardrails"."kind" IS 'What the guardrail controls: access (data retention, training, logging, allowed providers and models), safety (prompt injection, sensitive info), spend or rate. One kind per guardrail.';

COMMENT ON COLUMN "public"."workspace_guardrails"."is_workspace_baseline" IS 'The workspace baseline: the built-in access guardrail holding the workspace-wide rules edited under Settings, Privacy, assigned to the whole workspace. At most one per workspace; created by private.ensure_workspace_baseline_guardrail and protected by private.protect_workspace_baseline_guardrail.';

COMMENT ON COLUMN "public"."workspace_guardrails"."rate_counting" IS 'How a rate guardrail counts: shared (one allowance for everything it is assigned to), each_key (one per key or OAuth user it covers) or each_end_user (one per end user). NULL for rate guardrails made through the rate limits API: one allowance per key, member or department it is assigned to, and per end user at workspace level.';

COMMENT ON COLUMN "public"."workspace_guardrails"."rate_fail_closed" IS 'A rate guardrail waits for its counters and rejects the request when they cannot answer, instead of letting it through.';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_limit_nanos" IS 'A spend guardrail''s cost limit for each period, in nanodollars.';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_period" IS 'The UTC period a spend guardrail counts over: daily, weekly (from Monday) or monthly.';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_action" IS 'What a spend guardrail does at its limit: notify (pushes at 80% and 100%) or block (the same pushes, and the gateway refuses the API-key requests it covers until the period resets).';

COMMENT ON COLUMN "public"."workspace_guardrails"."spend_counting" IS 'How a spend guardrail counts: shared (one counter for each assignment, over every key it covers) or each_key (one counter for each key it covers).';
