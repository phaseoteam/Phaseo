CREATE TABLE "public"."workspace_spend_rules" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"           uuid                     NOT NULL,
  "name"                   text                     NOT NULL,
  "enabled"                boolean                  NOT NULL DEFAULT true,
  "metric"                 text                     NOT NULL,
  "scope_type"             text                     NOT NULL DEFAULT 'workspace'::text,
  "scope_id"               text,
  "scope_key_id"           uuid                     GENERATED ALWAYS AS (
    CASE
      WHEN (scope_type = 'key'::text) THEN (scope_id)::uuid
      ELSE NULL::uuid
    END) STORED,
  "scope_user_id"          uuid                     GENERATED ALWAYS AS (
    CASE
      WHEN (scope_type = 'member'::text) THEN (scope_id)::uuid
      ELSE NULL::uuid
    END) STORED,
  "scope_department_id"    uuid                     GENERATED ALWAYS AS (
    CASE
      WHEN (scope_type = 'department'::text) THEN (scope_id)::uuid
      ELSE NULL::uuid
    END) STORED,
  "period"                 text                     NOT NULL,
  "window_hours"           integer,
  "time_zone"              text,
  "base_kind"              text,
  "base_ref"               text,
  "base_amount_nanos"      bigint,
  "threshold_percents"     integer[],
  "threshold_amount_nanos" bigint,
  "runway_days"            integer,
  "spike_multiplier"       numeric(6,2),
  "spike_floor_nanos"      bigint,
  "action"                 text                     NOT NULL DEFAULT 'notify'::text,
  "block_at_percent"       integer                  NOT NULL DEFAULT 110,
  "block_at_amount_nanos"  bigint,
  "block_free_models"      boolean                  NOT NULL DEFAULT false,
  "cooldown_minutes"       integer                  NOT NULL DEFAULT 360,
  "created_by"             uuid,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"             timestamp with time zone,
  CONSTRAINT "workspace_spend_rules_action_check" CHECK ((action = ANY (ARRAY['notify'::text, 'block'::text]))),
  CONSTRAINT "workspace_spend_rules_balance_fields_check" CHECK (((metric <> 'balance'::text) OR ((scope_type = 'workspace'::text) AND (period = 'rolling'::text) AND (num_nonnulls(threshold_amount_nanos, runway_days) >= 1) AND (base_kind IS NULL) AND (threshold_percents IS NULL) AND (spike_multiplier IS NULL) AND (spike_floor_nanos IS NULL)))),
  CONSTRAINT "workspace_spend_rules_base_amount_nanos_check" CHECK (((base_amount_nanos IS NULL) OR (base_amount_nanos > 0))),
  CONSTRAINT "workspace_spend_rules_base_check" CHECK ((((base_kind IS NULL) AND (base_ref IS NULL) AND (base_amount_nanos IS NULL)) OR ((base_kind = 'amount'::text) AND (base_ref IS NULL) AND (base_amount_nanos IS NOT NULL)) OR ((base_kind = 'workspace_budget'::text) AND (base_amount_nanos IS NULL) AND (((base_ref = 'daily'::text) AND (period = 'day'::text)) OR ((base_ref = 'weekly'::text) AND (period = 'week'::text)) OR ((base_ref = 'monthly'::text) AND (period = 'month'::text)))) OR ((base_kind = 'key_limit'::text) AND (scope_type = 'key'::text) AND (base_amount_nanos IS NULL) AND (((base_ref = 'daily'::text) AND (period = 'day'::text)) OR ((base_ref = 'weekly'::text) AND (period = 'week'::text)) OR ((base_ref = 'monthly'::text) AND (period = 'month'::text)))) OR ((base_kind = 'previous_period'::text) AND (base_ref IS NULL) AND (base_amount_nanos IS NULL)))),
  CONSTRAINT "workspace_spend_rules_block_at_amount_check" CHECK ((((action = 'block'::text) AND (metric = 'spend'::text)) = (block_at_amount_nanos IS NOT NULL)) AND ((block_at_amount_nanos IS NULL) OR (block_at_amount_nanos >= threshold_amount_nanos))),
  CONSTRAINT "workspace_spend_rules_block_at_percent_check" CHECK (((block_at_percent >= 100) AND (block_at_percent <= 1000) AND ((action <> 'block'::text) OR (metric <> 'budget_percent'::text) OR (block_at_percent >= ALL (threshold_percents))))),
  CONSTRAINT "workspace_spend_rules_block_metric_check" CHECK (((action <> 'block'::text) OR ((metric = 'spend'::text) OR ((metric = 'budget_percent'::text) AND (base_kind <> 'previous_period'::text))))),
  CONSTRAINT "workspace_spend_rules_budget_percent_fields_check" CHECK (((metric <> 'budget_percent'::text) OR ((base_kind IS NOT NULL) AND (threshold_percents IS NOT NULL) AND (threshold_amount_nanos IS NULL) AND (runway_days IS NULL) AND (spike_multiplier IS NULL) AND (spike_floor_nanos IS NULL)))),
  CONSTRAINT "workspace_spend_rules_cooldown_minutes_check" CHECK (((cooldown_minutes >= 5) AND (cooldown_minutes <= 43200))),
  CONSTRAINT "workspace_spend_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_spend_rules_department_fkey" FOREIGN KEY (scope_department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_rules_forecast_fields_check" CHECK (((metric <> 'forecast'::text) OR ((period = ANY (ARRAY['day'::text, 'week'::text, 'month'::text])) AND (runway_days IS NULL) AND (spike_multiplier IS NULL) AND (spike_floor_nanos IS NULL) AND (((threshold_amount_nanos IS NOT NULL) AND (base_kind IS NULL) AND (threshold_percents IS NULL)) OR ((threshold_amount_nanos IS NULL) AND (base_kind IS NOT NULL) AND (threshold_percents IS NOT NULL)))))),
  CONSTRAINT "workspace_spend_rules_id_workspace_id_key" UNIQUE (id, workspace_id),
  CONSTRAINT "workspace_spend_rules_key_fkey" FOREIGN KEY (scope_key_id, workspace_id) REFERENCES public.keys(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_rules_member_fkey" FOREIGN KEY (workspace_id, scope_user_id) REFERENCES public.workspace_members(workspace_id, user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_rules_metric_check" CHECK ((metric = ANY (ARRAY['spend'::text, 'budget_percent'::text, 'forecast'::text, 'spike'::text, 'balance'::text]))),
  CONSTRAINT "workspace_spend_rules_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(name) <= 100))),
  CONSTRAINT "workspace_spend_rules_period_check" CHECK ((period = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'rolling'::text]))),
  CONSTRAINT "workspace_spend_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_spend_rules_runway_days_check" CHECK (((runway_days IS NULL) OR ((runway_days >= 1) AND (runway_days <= 365)))),
  CONSTRAINT "workspace_spend_rules_scope_check" CHECK (((scope_type = ANY (ARRAY['workspace'::text, 'key'::text, 'member'::text, 'department'::text, 'model'::text, 'provider'::text])) AND ((scope_type = 'workspace'::text) = (scope_id IS NULL)) AND ((scope_id IS NULL) OR ((char_length(scope_id) >= 1) AND (char_length(scope_id) <= 200))))),
  CONSTRAINT "workspace_spend_rules_spend_fields_check" CHECK (((metric <> 'spend'::text) OR ((threshold_amount_nanos IS NOT NULL) AND (base_kind IS NULL) AND (threshold_percents IS NULL) AND (runway_days IS NULL) AND (spike_multiplier IS NULL) AND (spike_floor_nanos IS NULL)))),
  CONSTRAINT "workspace_spend_rules_spike_check" CHECK ((((spike_multiplier IS NULL) OR ((spike_multiplier > (1)::numeric) AND (spike_multiplier <= (100)::numeric))) AND ((spike_floor_nanos IS NULL) OR (spike_floor_nanos >= 0)))),
  CONSTRAINT "workspace_spend_rules_spike_fields_check" CHECK (((metric <> 'spike'::text) OR ((period = 'rolling'::text) AND (spike_multiplier IS NOT NULL) AND (spike_floor_nanos IS NOT NULL) AND (base_kind IS NULL) AND (threshold_percents IS NULL) AND (threshold_amount_nanos IS NULL) AND (runway_days IS NULL)))),
  CONSTRAINT "workspace_spend_rules_threshold_amount_nanos_check" CHECK (((threshold_amount_nanos IS NULL) OR (threshold_amount_nanos > 0))),
  CONSTRAINT "workspace_spend_rules_threshold_percents_check" CHECK (((threshold_percents IS NULL) OR ((cardinality(threshold_percents) >= 1) AND (cardinality(threshold_percents) <= 5) AND (array_position(threshold_percents, NULL::integer) IS NULL) AND (1 <= ALL (threshold_percents)) AND (1000 >= ALL (threshold_percents))))),
  CONSTRAINT "workspace_spend_rules_time_zone_check" CHECK (((time_zone IS NULL) OR ((char_length(time_zone) >= 1) AND (char_length(time_zone) <= 64)))),
  CONSTRAINT "workspace_spend_rules_window_hours_check" CHECK ((((period = 'rolling'::text) = (window_hours IS NOT NULL)) AND ((window_hours IS NULL) OR ((window_hours >= 1) AND (window_hours <= 720))))),
  CONSTRAINT "workspace_spend_rules_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rules_created_by_idx ON public.workspace_spend_rules USING btree (created_by);

CREATE INDEX workspace_spend_rules_department_idx ON public.workspace_spend_rules USING btree (scope_department_id, workspace_id)
  WHERE (scope_department_id IS NOT NULL);

CREATE INDEX workspace_spend_rules_key_idx ON public.workspace_spend_rules USING btree (scope_key_id, workspace_id)
  WHERE (scope_key_id IS NOT NULL);

CREATE INDEX workspace_spend_rules_member_idx ON public.workspace_spend_rules USING btree (workspace_id, scope_user_id)
  WHERE (scope_user_id IS NOT NULL);

CREATE INDEX workspace_spend_rules_workspace_active_idx ON public.workspace_spend_rules USING btree (workspace_id, created_at, id)
  WHERE (deleted_at IS NULL);

CREATE TRIGGER workspace_spend_rules_enforce_limit
  BEFORE INSERT OR UPDATE OF workspace_id, deleted_at ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_spend_rule_limit();

CREATE TRIGGER workspace_spend_rules_lift_blocks
  AFTER UPDATE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.lift_spend_blocks_on_rule_change();

CREATE TRIGGER workspace_spend_rules_lift_blocks_on_delete
  BEFORE DELETE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.lift_spend_blocks_on_rule_change();

CREATE TRIGGER workspace_spend_rules_set_updated_at
  BEFORE UPDATE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE TRIGGER workspace_spend_rules_validate
  BEFORE INSERT OR UPDATE ON public.workspace_spend_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_workspace_spend_rule();

CREATE POLICY "workspace_spend_rules_select_member" ON "public"."workspace_spend_rules"
  FOR SELECT
  TO "authenticated"
  USING (((deleted_at IS NULL) AND public.is_workspace_member(workspace_id)));

COMMENT ON TABLE "public"."workspace_spend_rules" IS 'Workspace spend rules: thresholds in $ or % over a scope and a period that notify, or notify and then block (best effort, minutes after the threshold). Members read; owners and admins write through the API with the service role. At most 50 non-deleted rules per workspace. Evaluated by public.sweep_spend_rules.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."metric" IS 'spend: spend reached threshold_amount_nanos. budget_percent: spend reached threshold_percents of the base. forecast: spend projected to the period end reaches threshold_amount_nanos, or threshold_percents of the base. spike: spend over the last window_hours is at least spike_multiplier times the median of the same window over the prior 7 days, and at least spike_floor_nanos. balance: workspace balance at or below threshold_amount_nanos, or runway (balance over the burn rate across window_hours) below runway_days.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."scope_id" IS 'What the rule covers; null for the workspace scope. A key id (key), user id (member: keys the member created plus their OAuth requests), department id (department, attributed by private.spend_scope_departments), model id (model) or provider id (provider). Key, member and department ids must be in the rule''s workspace (composite foreign keys on the generated scope_*_id columns).';

COMMENT ON COLUMN "public"."workspace_spend_rules"."period" IS 'day, week (Monday) or month: calendar periods in time_zone. rolling: the last window_hours hours, with cooldown_minutes between alerts. spike and balance rules are always rolling.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."time_zone" IS 'IANA time zone for calendar periods. Null means the workspace''s billing_time_zone at evaluation time.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."base_kind" IS 'What threshold_percents (and block_at_percent) are percentages of. amount: base_amount_nanos. workspace_budget: the workspace budget for interval base_ref. key_limit: the scoped key''s cost limit for interval base_ref. previous_period: spend at the same point of the previous period. base_ref (daily, weekly, monthly) must match period. Guardrail budget fields are never a base.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."threshold_percents" IS 'Up to five warn thresholds as whole percentages of the base, stored sorted and distinct. Each fires at most once per period; crossing several at once sends one alert naming the highest.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."block_at_percent" IS 'Grace margin for budget_percent block rules: block once spend reaches this percentage of the base (default 110). At least the highest warn threshold. Ignored for notify rules.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."block_at_amount_nanos" IS 'For spend block rules: block once spend reaches this amount. At least threshold_amount_nanos. Null for every other rule.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."block_free_models" IS 'Whether a block also stops requests to free models. Off by default: free models keep working during a block.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."cooldown_minutes" IS 'Minimum time between alerts for rolling, spike and balance rules. Calendar rules fire each threshold once per period instead.';

COMMENT ON COLUMN "public"."workspace_spend_rules"."deleted_at" IS 'Soft delete. Deleted rules are not evaluated, are hidden from members, and do not count toward the 50-rule cap.';

REVOKE ALL ON TABLE "public"."workspace_spend_rules" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rules" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rules" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_rules" TO "authenticated";
