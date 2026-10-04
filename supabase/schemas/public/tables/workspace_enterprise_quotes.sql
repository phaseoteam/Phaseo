CREATE TABLE "public"."workspace_enterprise_quotes" (
  "id"                            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"                  uuid                     NOT NULL,
  "pricing_version"               text                     NOT NULL,
  "member_count"                  integer                  NOT NULL,
  "tier_key"                      text                     NOT NULL,
  "expected_monthly_top_up_nanos" bigint                   NOT NULL,
  "typical_top_up_nanos"          bigint                   NOT NULL,
  "payment_preference"            text                     NOT NULL,
  "needs_sso"                     boolean                  NOT NULL DEFAULT false,
  "needs_scim"                    boolean                  NOT NULL DEFAULT false,
  "wants_slack_connect"           boolean                  NOT NULL DEFAULT false,
  "recommended_variant"           text                     NOT NULL,
  "selected_variant"              text,
  "plan_key"                      text,
  "monthly_price_cents"           integer,
  "included_members"              integer,
  "included_card_top_up_nanos"    bigint                   NOT NULL DEFAULT 0,
  "fee_policy"                    text,
  "stripe_checkout_session_id"    text,
  "questionnaire"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "expires_at"                    timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
  "consumed_at"                   timestamp with time zone,
  "created_at"                    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_enterprise_quotes_expected_monthly_top_up_nanos_check" CHECK ((expected_monthly_top_up_nanos >= 0)),
  CONSTRAINT "workspace_enterprise_quotes_fee_policy_check" CHECK (((fee_policy IS NULL) OR (fee_policy = ANY (ARRAY['standard_5_percent'::text, 'included_allowance'::text])))),
  CONSTRAINT "workspace_enterprise_quotes_included_card_top_up_nanos_check" CHECK ((included_card_top_up_nanos >= 0)),
  CONSTRAINT "workspace_enterprise_quotes_member_count_check" CHECK (((member_count >= 1) AND (member_count <= 2147483647))),
  CONSTRAINT "workspace_enterprise_quotes_payment_preference_check" CHECK ((payment_preference = ANY (ARRAY['card'::text, 'ach'::text, 'bank_transfer'::text]))),
  CONSTRAINT "workspace_enterprise_quotes_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_enterprise_quotes_questionnaire_check" CHECK ((jsonb_typeof(questionnaire) = 'object'::text)),
  CONSTRAINT "workspace_enterprise_quotes_recommended_variant_check" CHECK ((recommended_variant = ANY (ARRAY['core'::text, 'included_payments'::text]))),
  CONSTRAINT "workspace_enterprise_quotes_selected_variant_check" CHECK (((selected_variant IS NULL) OR (selected_variant = ANY (ARRAY['core'::text, 'included_payments'::text])))),
  CONSTRAINT "workspace_enterprise_quotes_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id),
  CONSTRAINT "workspace_enterprise_quotes_typical_top_up_nanos_check" CHECK ((typical_top_up_nanos >= 0)),
  CONSTRAINT "workspace_enterprise_quotes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_enterprise_quotes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_enterprise_quotes_workspace_created_idx ON public.workspace_enterprise_quotes USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_enterprise_quotes"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_enterprise_quotes"."member_count" IS 'Quoted active-member capacity. New self-serve Enterprise quotes are validated by the application between 100 and 100,000 members; the database retains legacy quotes below the current minimum.';

REVOKE ALL ON TABLE "public"."workspace_enterprise_quotes" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_enterprise_quotes" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_enterprise_quotes" FROM "anon", "authenticated";
