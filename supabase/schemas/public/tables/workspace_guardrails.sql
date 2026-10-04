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
  "daily_limit_requests"                    bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_requests"                   bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_requests"                  bigint                   NOT NULL DEFAULT 0,
  "daily_limit_cost_nanos"                  bigint                   NOT NULL DEFAULT 0,
  "weekly_limit_cost_nanos"                 bigint                   NOT NULL DEFAULT 0,
  "monthly_limit_cost_nanos"                bigint                   NOT NULL DEFAULT 0,
  "created_at"                              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "updated_at"                              timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "prompt_injection_enabled"                boolean                  NOT NULL DEFAULT false,
  "prompt_injection_action"                 text                     NOT NULL DEFAULT 'flag'::text,
  "sensitive_info_enabled"                  boolean                  NOT NULL DEFAULT false,
  "sensitive_info_default_action"           text                     NOT NULL DEFAULT 'redact'::text,
  "sensitive_info_rules"                    jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "model_restriction_mode"                  text                     NOT NULL DEFAULT 'none'::text,
  CONSTRAINT "workspace_guardrails_model_restriction_mode_check" CHECK ((model_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_guardrails_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_guardrails_prompt_injection_action_check" CHECK ((prompt_injection_action = ANY (ARRAY['flag'::text, 'redact'::text, 'block'::text]))),
  CONSTRAINT "workspace_guardrails_provider_restriction_mode_check" CHECK ((provider_restriction_mode = ANY (ARRAY['none'::text, 'allowlist'::text, 'blocklist'::text]))),
  CONSTRAINT "workspace_guardrails_sensitive_info_default_action_check" CHECK ((sensitive_info_default_action = ANY (ARRAY['flag'::text, 'redact'::text, 'block'::text]))),
  CONSTRAINT "workspace_guardrails_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_guardrails"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_guardrails_workspace_id_idx ON public.workspace_guardrails USING btree (workspace_id);

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

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
