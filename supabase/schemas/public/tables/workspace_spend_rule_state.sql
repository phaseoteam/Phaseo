CREATE TABLE "public"."workspace_spend_rule_state" (
  "rule_id"               uuid                     NOT NULL,
  "workspace_id"          uuid                     NOT NULL,
  "period_start"          timestamp with time zone NOT NULL,
  "period_end"            timestamp with time zone,
  "highest_percent_fired" integer,
  "amount_fired_at"       timestamp with time zone,
  "last_fired_at"         timestamp with time zone,
  "fire_count"            integer                  NOT NULL DEFAULT 0,
  "last_value_nanos"      bigint,
  "last_base_nanos"       bigint,
  "armed"                 boolean                  NOT NULL DEFAULT true,
  "last_dedupe_key"       text,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_rule_state_fire_count_check" CHECK ((fire_count >= 0)),
  CONSTRAINT "workspace_spend_rule_state_highest_percent_fired_check" CHECK (((highest_percent_fired IS NULL) OR ((highest_percent_fired >= 1) AND (highest_percent_fired <= 1000)))),
  CONSTRAINT "workspace_spend_rule_state_period_check" CHECK (((period_end IS NULL) OR (period_end > period_start))),
  CONSTRAINT "workspace_spend_rule_state_pkey" PRIMARY KEY (rule_id, period_start),
  CONSTRAINT "workspace_spend_rule_state_rule_fkey" FOREIGN KEY (rule_id, workspace_id) REFERENCES public.workspace_spend_rules(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rule_state"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_state_workspace_idx ON public.workspace_spend_rule_state USING btree (workspace_id, period_start DESC);

CREATE TRIGGER workspace_spend_rule_state_set_updated_at
  BEFORE UPDATE ON public.workspace_spend_rule_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "workspace_spend_rule_state_select_member" ON "public"."workspace_spend_rule_state"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE "public"."workspace_spend_rule_state" IS 'What a spend rule has fired, one row per rule and period. Written only when the rule fires or its period rolls over, never on every evaluation. Calendar rules key rows by the period start in the rule''s time zone; rolling, spike and balance rules keep one row with period_start = ''-infinity'' and use last_fired_at for the cooldown.';

COMMENT ON COLUMN "public"."workspace_spend_rule_state"."highest_percent_fired" IS 'The highest threshold_percents value already sent this period. Thresholds at or below it do not fire again.';

COMMENT ON COLUMN "public"."workspace_spend_rule_state"."amount_fired_at" IS 'When the amount threshold (threshold_amount_nanos) fired this period, for spend, forecast and balance rules.';

COMMENT ON COLUMN "public"."workspace_spend_rule_state"."armed" IS 'For balance rules: false after an alert until the balance (or runway) recovers above the threshold, as workspace_low_balance_push_state does for pushes.';

COMMENT ON COLUMN "public"."workspace_spend_rule_state"."last_dedupe_key" IS 'The email_outbox dedupe_key of the last event this rule queued.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_state" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_state" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_state" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_rule_state" TO "authenticated";
