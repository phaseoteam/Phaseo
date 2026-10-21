-- phaseo:allow-destructive-migration reason: the only DELETE is the existing route replacement inside set_notification_event_destinations, recreated unchanged apart from the three new event kinds. The migration deletes no data.

-- Spend rules schema (PR 4 of the spend rules stack). Tables only: nothing evaluates or emits yet.
-- * workspace_spend_rules (+ destinations, state, blocks, dirty set), members read, service role writes,
--   50 non-deleted rules per workspace, per-metric CHECKs, IANA time zone validation.
-- * workspace_settings.billing_time_zone (default 'UTC', validated against pg_timezone_names).
-- * keys and notification_destinations gain UNIQUE (id, workspace_id) so rules can reference them
--   with composite foreign keys that keep both in the rule's workspace.
-- * Routable notification kinds spend_alert, spend_blocked and spend_report.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.is_valid_time_zone (
  p_time_zone text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Names from the server's IANA database. The posix/ and right/ trees and the server-local
  -- aliases are not zones a user picks. Case-sensitive, as browsers report them.
  select p_time_zone is not null
    and pg_catalog.char_length(p_time_zone) between 1 and 64
    and p_time_zone !~ '^(posix|right)/'
    and p_time_zone not in ('posixrules', 'localtime', 'Factory')
    and exists (
      select 1
      from pg_catalog.pg_timezone_names zone
      where zone.name = p_time_zone
    );
$function$;

COMMENT ON FUNCTION "private"."is_valid_time_zone"(text) IS 'True when the text is an IANA time zone name the server knows (pg_timezone_names), excluding the posix/ and right/ trees and server-local aliases. Used by spend rule and billing time zone validation.';

REVOKE ALL ON FUNCTION "private"."is_valid_time_zone"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_valid_time_zone"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_valid_time_zone"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_valid_time_zone"(text) TO "service_role";

ALTER TABLE "public"."workspace_settings"
  ADD COLUMN "billing_time_zone" text NOT NULL DEFAULT 'UTC'::text;

ALTER TABLE "public"."workspace_settings"
  ADD CONSTRAINT "workspace_settings_billing_time_zone_check" CHECK (((char_length(billing_time_zone) >= 1) AND (char_length(billing_time_zone) <= 64)));

COMMENT ON COLUMN "public"."workspace_settings"."billing_time_zone" IS 'IANA time zone for spend rule calendar periods (rules with a null time_zone) and spend reports. Validated against pg_timezone_names by public.validate_workspace_billing_time_zone. Enforced key limits and workspace budgets stay on UTC.';

CREATE OR REPLACE FUNCTION public.validate_workspace_billing_time_zone()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.billing_time_zone := pg_catalog.btrim(new.billing_time_zone);
  -- The default needs no lookup; every other value must be a zone the server knows.
  if new.billing_time_zone is distinct from 'UTC'
    and not private.is_valid_time_zone(new.billing_time_zone) then
    raise exception 'invalid_time_zone'
      using errcode = '22023',
        detail = pg_catalog.format('%s is not an IANA time zone.', new.billing_time_zone);
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_billing_time_zone"() TO "service_role";

COMMENT ON FUNCTION "public"."validate_workspace_billing_time_zone"() IS 'Rejects a workspace_settings.billing_time_zone that is not an IANA time zone (private.is_valid_time_zone). Definer rights let admins writing through RLS use the private helper.';

REVOKE ALL ON FUNCTION "public"."validate_workspace_billing_time_zone"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_billing_time_zone"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."validate_workspace_billing_time_zone"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER validate_billing_time_zone
  BEFORE INSERT OR UPDATE OF billing_time_zone ON public.workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_workspace_billing_time_zone();

ALTER TABLE "public"."keys"
  ADD CONSTRAINT "keys_id_workspace_id_key" UNIQUE (id, workspace_id);

ALTER TABLE "public"."notification_destinations"
  ADD CONSTRAINT "notification_destinations_id_workspace_id_key" UNIQUE (id, workspace_id);

ALTER TABLE "public"."notification_event_destinations"
  DROP CONSTRAINT "notification_event_destinations_event_kind_check";

ALTER TABLE "public"."notification_event_destinations"
  ADD CONSTRAINT "notification_event_destinations_event_kind_check"
    CHECK ((event_kind = ANY (ARRAY['low_balance'::text, 'auto_top_up_failed'::text, 'payment_method_expiring'::text, 'model_deprecation'::text, 'model_substitution'::text, 'rate_limit_throttled'::text, 'spend_alert'::text, 'spend_blocked'::text, 'spend_report'::text])));

CREATE OR REPLACE FUNCTION public.set_notification_event_destinations (
  p_workspace_id    uuid,
  p_event_kind      text,
  p_destination_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_event_kind, 0));

  if p_event_kind not in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation', 'model_substitution', 'rate_limit_throttled', 'spend_alert', 'spend_blocked', 'spend_report') then
    raise exception 'invalid_notification_event_kind';
  end if;

  if (
    select count(*)
    from public.notification_destinations
    where workspace_id = p_workspace_id
      and status = 'active'
      and id = any(p_destination_ids)
  ) <> cardinality(p_destination_ids) then
    raise exception 'notification_destination_not_found';
  end if;

  delete from public.notification_event_destinations
  where workspace_id = p_workspace_id and event_kind = p_event_kind;

  insert into public.notification_event_destinations (workspace_id, event_kind, destination_id)
  select p_workspace_id, p_event_kind, destination_id
  from unnest(p_destination_ids) as destination_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enforce_workspace_spend_rule_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit constant integer := 50;
  v_existing integer;
begin
  -- Only rules that become live count: inserts, restores and moves. Deleting never blocks.
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.workspace_id is not distinct from old.workspace_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workspace_spend_rules:' || new.workspace_id::text, 0)
  );

  select count(*) into v_existing
  from public.workspace_spend_rules rule
  where rule.workspace_id = new.workspace_id
    and rule.deleted_at is null
    and rule.id <> new.id;

  if v_existing >= v_limit then
    raise exception 'spend_rule_limit_reached'
      using errcode = '23514',
        detail = pg_catalog.format('A workspace may have %s spend rules.', v_limit);
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() TO "service_role";

COMMENT ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() IS 'Caps each workspace at 50 non-deleted spend rules (an abuse cap, the same on every plan), using a transaction-scoped advisory lock per workspace.';

REVOKE ALL ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.validate_workspace_spend_rule()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'spend_rule_workspace_immutable'
      using errcode = '22023',
        detail = 'A spend rule cannot move to another workspace.';
  end if;

  new.name := pg_catalog.btrim(new.name);
  new.scope_id := nullif(pg_catalog.btrim(new.scope_id), '');

  -- Key, member and department scopes hold a uuid. Checked here, before the generated
  -- scope_*_id columns cast it, so the error names the field.
  if new.scope_type in ('key', 'member', 'department') then
    if new.scope_id is null
      or new.scope_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_spend_rule_scope_id'
        using errcode = '22023',
          detail = pg_catalog.format('A %s scope needs the %s id.', new.scope_type, new.scope_type);
    end if;
    new.scope_id := pg_catalog.lower(new.scope_id);
  end if;

  if new.time_zone is not null then
    new.time_zone := nullif(pg_catalog.btrim(new.time_zone), '');
    if new.time_zone is not null and not private.is_valid_time_zone(new.time_zone) then
      raise exception 'invalid_time_zone'
        using errcode = '22023',
          detail = pg_catalog.format('%s is not an IANA time zone.', new.time_zone);
    end if;
  end if;

  -- Thresholds are stored sorted and distinct; the CHECK constraints then bound them.
  if new.threshold_percents is not null then
    new.threshold_percents := array(
      select distinct threshold
      from pg_catalog.unnest(new.threshold_percents) as threshold
      order by threshold
    );
    if pg_catalog.cardinality(new.threshold_percents) = 0 then
      new.threshold_percents := null;
    end if;
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_spend_rule"() TO "service_role";

COMMENT ON FUNCTION "public"."validate_workspace_spend_rule"() IS 'Normalizes and validates a spend rule before the CHECK constraints run: keeps the workspace fixed, trims names, requires uuid ids for key, member and department scopes, validates the IANA time zone, and sorts and dedupes threshold_percents.';

REVOKE ALL ON FUNCTION "public"."validate_workspace_spend_rule"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_spend_rule"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."validate_workspace_spend_rule"() FROM PUBLIC, "anon", "authenticated";

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

CREATE TABLE "public"."workspace_spend_rule_destinations" (
  "rule_id"        uuid                     NOT NULL,
  "destination_id" uuid                     NOT NULL,
  "workspace_id"   uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_rule_destinations_destination_fkey" FOREIGN KEY (destination_id, workspace_id) REFERENCES public.notification_destinations(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_rule_destinations_pkey" PRIMARY KEY (rule_id, destination_id),
  CONSTRAINT "workspace_spend_rule_destinations_rule_fkey" FOREIGN KEY (rule_id, workspace_id) REFERENCES public.workspace_spend_rules(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_rule_destinations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_destinations_destination_idx ON public.workspace_spend_rule_destinations USING btree (destination_id, workspace_id);

CREATE INDEX workspace_spend_rule_destinations_workspace_idx ON public.workspace_spend_rule_destinations USING btree (workspace_id);

CREATE POLICY "workspace_spend_rule_destinations_select_member" ON "public"."workspace_spend_rule_destinations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE "public"."workspace_spend_rule_destinations" IS 'Where a spend rule''s alerts go. When a rule has rows here they replace the workspace''s spend_alert / spend_blocked routes for that rule; with none, the routes apply. Both ids must be in the same workspace. Destinations that are not active are skipped at delivery.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_destinations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_destinations" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_destinations" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_rule_destinations" TO "authenticated";

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

CREATE TABLE "public"."workspace_spend_blocks" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "rule_id"           uuid,
  "scope_type"        text                     NOT NULL,
  "scope_id"          text,
  "block_free_models" boolean                  NOT NULL DEFAULT false,
  "period_start"      timestamp with time zone NOT NULL,
  "resets_at"         timestamp with time zone,
  "spend_nanos"       bigint                   NOT NULL,
  "limit_nanos"       bigint                   NOT NULL,
  "started_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "lifted_at"         timestamp with time zone,
  "lifted_by"         uuid,
  "lift_reason"       text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_blocks_amounts_check" CHECK (((spend_nanos >= 0) AND (limit_nanos > 0))),
  CONSTRAINT "workspace_spend_blocks_lift_check" CHECK ((((lifted_at IS NULL) = (lift_reason IS NULL)) AND ((lifted_by IS NULL) OR (lift_reason = 'manual'::text)) AND ((lifted_at IS NULL) OR (lifted_at >= started_at)))),
  CONSTRAINT "workspace_spend_blocks_lift_reason_check" CHECK (((lift_reason IS NULL) OR (lift_reason = ANY (ARRAY['manual'::text, 'period_reset'::text, 'below_limit'::text, 'rule_changed'::text, 'rule_disabled'::text, 'rule_deleted'::text])))),
  CONSTRAINT "workspace_spend_blocks_lifted_by_fkey" FOREIGN KEY (lifted_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_spend_blocks_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_spend_blocks_resets_at_check" CHECK (((resets_at IS NULL) OR (resets_at > period_start))),
  CONSTRAINT "workspace_spend_blocks_rule_fkey" FOREIGN KEY (rule_id, workspace_id) REFERENCES public.workspace_spend_rules(id, workspace_id) ON DELETE SET NULL (rule_id),
  CONSTRAINT "workspace_spend_blocks_scope_check" CHECK (((scope_type = ANY (ARRAY['workspace'::text, 'key'::text, 'member'::text, 'department'::text, 'model'::text, 'provider'::text])) AND ((scope_type = 'workspace'::text) = (scope_id IS NULL)))),
  CONSTRAINT "workspace_spend_blocks_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_blocks"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX workspace_spend_blocks_active_rule_uidx ON public.workspace_spend_blocks USING btree (rule_id)
  WHERE ((lifted_at IS NULL) AND (rule_id IS NOT NULL));

CREATE INDEX workspace_spend_blocks_lifted_by_idx ON public.workspace_spend_blocks USING btree (lifted_by)
  WHERE (lifted_by IS NOT NULL);

CREATE INDEX workspace_spend_blocks_rule_period_idx ON public.workspace_spend_blocks USING btree (rule_id, period_start);

CREATE INDEX workspace_spend_blocks_workspace_active_idx ON public.workspace_spend_blocks USING btree (workspace_id)
  WHERE (lifted_at IS NULL);

CREATE INDEX workspace_spend_blocks_workspace_started_idx ON public.workspace_spend_blocks USING btree (workspace_id, started_at DESC);

CREATE TRIGGER workspace_spend_blocks_set_updated_at
  BEFORE UPDATE ON public.workspace_spend_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "workspace_spend_blocks_select_member" ON "public"."workspace_spend_blocks"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

COMMENT ON TABLE "public"."workspace_spend_blocks" IS 'Blocks started by spend rules, active (lifted_at null) and lifted. Scope and block_free_models are copied from the rule when the block starts, so the request path can match it without the rule. At most one active block per rule. A block lifted manually is not restarted in the same period (same rule_id and period_start).';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."resets_at" IS 'When the block''s period ends and it lifts by itself (the 429 Retry-After). Null for rolling rules, which lift once spend in the window falls below the limit.';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."limit_nanos" IS 'The spend at which the rule blocks: block_at_amount_nanos, or block_at_percent of the base when the block started.';

COMMENT ON COLUMN "public"."workspace_spend_blocks"."lift_reason" IS 'manual (lifted_by set), period_reset, below_limit (rolling window or a raised base), rule_changed, rule_disabled or rule_deleted.';

REVOKE ALL ON TABLE "public"."workspace_spend_blocks" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_blocks" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_blocks" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."workspace_spend_blocks" TO "authenticated";

CREATE TABLE "public"."workspace_spend_rule_dirty" (
  "workspace_id" uuid                     NOT NULL,
  "dirtied_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_rule_dirty_pkey" PRIMARY KEY (workspace_id)
);

ALTER TABLE "public"."workspace_spend_rule_dirty"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_rule_dirty_dirtied_at_idx ON public.workspace_spend_rule_dirty USING btree (dirtied_at);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_rule_dirty"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_spend_rule_dirty" IS 'Workspaces whose spend changed since their spend rules were last evaluated. Marked when usage is rolled up; public.sweep_spend_rules claims rows with SKIP LOCKED and deletes them. No foreign key, so marking from the rollup can never fail for a deleted workspace; the sweep skips workspaces that no longer exist. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_rule_dirty" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_rule_dirty" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_rule_dirty" FROM "anon", "authenticated";
