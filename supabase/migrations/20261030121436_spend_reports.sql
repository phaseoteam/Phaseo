-- Spend reports (PR 12 of the spend rules stack): daily, weekly or monthly spend report emails for
-- workspace owners (admins by opt-in), plus one routed spend_report event per workspace.
-- * workspace_settings.spend_report_cadence (off | daily | weekly | monthly, default weekly) and
--   spend_report_include_admins (default false).
-- * workspace_spend_report_recipients: per-person unsubscribe token and opt-out per workspace.
-- * workspace_spend_report_runs: the last period handled per workspace and cadence.
-- * private.spend_report_period: the last complete period in billing_time_zone and whether it is due
--   (09:00 to 21:00 local on the first day after it).
-- * private.spend_report_facts: the whole report for one workspace, aggregated in SQL (usage overview
--   totals and change, top keys, models, members and departments, month forecast, runway, alerts,
--   blocks).
-- * public.queue_spend_reports: queues due reports (called by the scheduled job behind
--   SPEND_REPORTS_ENABLED, default off), skipping periods without spend.
-- * public.set_spend_report_subscription: the email's unsubscribe link.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

ALTER TABLE "public"."workspace_settings"
  ADD COLUMN IF NOT EXISTS "spend_report_cadence" text NOT NULL DEFAULT 'weekly'::text,
  ADD COLUMN IF NOT EXISTS "spend_report_include_admins" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."workspace_settings"
  ADD CONSTRAINT "workspace_settings_spend_report_cadence_check" CHECK ((spend_report_cadence = ANY (ARRAY['off'::text, 'daily'::text, 'weekly'::text, 'monthly'::text])));

COMMENT ON COLUMN "public"."workspace_settings"."spend_report_cadence" IS 'How often owners (and admins with spend_report_include_admins) get a spend report email: off, daily (09:00 for the day before), weekly (Monday 09:00 for the previous ISO week) or monthly (the 1st at 09:00 for the previous month), in billing_time_zone. Periods without spend are skipped. Queued by public.queue_spend_reports behind SPEND_REPORTS_ENABLED.';

COMMENT ON COLUMN "public"."workspace_settings"."spend_report_include_admins" IS 'Also email the spend report to workspace admins, not only owners. Anyone can unsubscribe from the link in the email.';

CREATE TABLE "public"."workspace_spend_report_recipients" (
  "workspace_id"      uuid                     NOT NULL,
  "user_id"           uuid                     NOT NULL,
  "unsubscribe_token" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opted_out_at"      timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_report_recipients_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "workspace_spend_report_recipients_unsubscribe_token_key" UNIQUE (unsubscribe_token),
  CONSTRAINT "workspace_spend_report_recipients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_report_recipients_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_report_recipients"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_report_recipients_user_id_idx ON public.workspace_spend_report_recipients USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_report_recipients"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_spend_report_recipients"."opted_out_at" IS 'When this person unsubscribed from this workspace''s spend report emails (the link in every report). Null while subscribed. Owners and admins who opted out get no report email until they subscribe again from the same link.';

COMMENT ON COLUMN "public"."workspace_spend_report_recipients"."unsubscribe_token" IS 'The unguessable token in this person''s unsubscribe link and List-Unsubscribe header for this workspace''s reports. Stable, so every report carries the same link.';

COMMENT ON TABLE "public"."workspace_spend_report_recipients" IS 'One row per person who has been sent (or is due) a spend report email for a workspace: the per-recipient unsubscribe token and opt-out. Rows are created by public.queue_spend_reports when it first emails someone. Service role only; the public unsubscribe page reaches it through public.set_spend_report_subscription.';

REVOKE ALL ON TABLE "public"."workspace_spend_report_recipients" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_report_recipients" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_report_recipients" FROM "anon", "authenticated";

CREATE TABLE "public"."workspace_spend_report_runs" (
  "workspace_id" uuid                     NOT NULL,
  "cadence"      text                     NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end"   timestamp with time zone NOT NULL,
  "status"       text                     NOT NULL,
  "spend_nanos"  numeric,
  "recipients"   integer                  NOT NULL DEFAULT 0,
  "event_id"     uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_report_runs_cadence_check" CHECK ((cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "workspace_spend_report_runs_period_check" CHECK ((period_end > period_start)),
  CONSTRAINT "workspace_spend_report_runs_pkey" PRIMARY KEY (workspace_id, cadence),
  CONSTRAINT "workspace_spend_report_runs_recipients_check" CHECK ((recipients >= 0)),
  CONSTRAINT "workspace_spend_report_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'skipped'::text]))),
  CONSTRAINT "workspace_spend_report_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_report_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_report_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."event_id" IS 'The email_outbox id of the routed spend_report event, when this run queued one.';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."period_start" IS 'Start of the last report period handled for this cadence (local midnight in the workspace billing_time_zone, as an instant).';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."recipients" IS 'How many report emails the run queued (owners, plus admins when spend_report_include_admins is on, less anyone who unsubscribed).';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."status" IS 'queued: the report was queued (routed event plus emails). skipped: the workspace spent nothing in the period.';

COMMENT ON TABLE "public"."workspace_spend_report_runs" IS 'The last spend report period public.queue_spend_reports handled per workspace and cadence, so each period is computed once (including periods skipped for zero spend). One row per workspace and cadence, updated in place. The email_outbox dedupe keys guarantee no duplicate report even if this row is lost. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_report_runs" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_report_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_report_runs" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.spend_report_period (
  p_cadence   text,
  p_time_zone text,
  p_now       timestamp with time zone
)
  RETURNS TABLE (
    due            boolean,
    period_start   timestamp with time zone,
    period_end     timestamp with time zone,
    previous_start timestamp with time zone,
    previous_end   timestamp with time zone,
    due_from       timestamp with time zone,
    due_until      timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The last complete spend report period before p_now in p_time_zone, and the period before it
  -- (for the change): the day before (daily), the Monday-to-Sunday ISO week before (weekly) or the
  -- calendar month before (monthly), local midnight to local midnight. The current period comes
  -- from private.spend_rule_period, the spend rules' calendar, so a DST change makes a day 23 or 25
  -- hours long here too. The report is due from 09:00 local time on the first day of the current
  -- period until 21:00, so a late or missed run still sends it that day; outside that window the
  -- period is not due. No row for 'off' or anything else.
  select
    p_now >= due.due_from and p_now < due.due_until,
    (local.current_start - cadence.unit) at time zone p_time_zone,
    current_period.period_start,
    (local.current_start - cadence.unit - cadence.unit) at time zone p_time_zone,
    (local.current_start - cadence.unit) at time zone p_time_zone,
    due.due_from,
    due.due_until
  from (
    select
      case p_cadence when 'daily' then 'day' when 'weekly' then 'week' when 'monthly' then 'month' end as calendar,
      case p_cadence when 'daily' then interval '1 day' when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' end as unit
  ) cadence
  cross join lateral private.spend_rule_period(cadence.calendar, p_time_zone, p_now) current_period
  cross join lateral (select current_period.period_start at time zone p_time_zone as current_start) local
  cross join lateral (
    select
      (local.current_start + interval '9 hours') at time zone p_time_zone as due_from,
      (local.current_start + interval '21 hours') at time zone p_time_zone as due_until
  ) due
  where cadence.calendar is not null;
$function$;

COMMENT ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) IS 'The last complete daily, weekly (ISO, Monday) or monthly spend report period before p_now in p_time_zone, the period before it, and whether the report is due (09:00 to 21:00 local time on the first day after the period).';

REVOKE ALL ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_period"(text, text, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_report_people (
  p_workspace_id   uuid,
  p_include_admins boolean
)
  RETURNS TABLE (
    user_id uuid,
    role    text,
    email   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Who a workspace's spend report is for: the owner and every member with the owner role, plus
  -- members with the admin role when p_include_admins. One row per person (owner wins over admin),
  -- with their sign-in email, or null when they have none. Unsubscribes are applied by the caller.
  select distinct on (person.user_id) person.user_id, person.role, nullif(btrim(account.email), '')
  from (
    select workspace.owner_user_id as user_id, 'owner' as role, 0 as rank
    from public.workspaces workspace
    where workspace.id = p_workspace_id and workspace.owner_user_id is not null
    union all
    select member.user_id, member.role::text, case when member.role::text = 'owner' then 0 else 1 end
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and (member.role::text = 'owner' or (p_include_admins and member.role::text = 'admin'))
  ) person
  left join auth.users account on account.id = person.user_id
  order by person.user_id, person.rank;
$function$;

COMMENT ON FUNCTION "private"."spend_report_people"(uuid, boolean) IS 'The owner and owner-role members of a workspace, plus admins when p_include_admins, with their emails: who its spend report is emailed to (before unsubscribes).';

REVOKE ALL ON FUNCTION "private"."spend_report_people"(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_people"(uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_people"(uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_people"(uuid, boolean) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_report_due_workspaces (
  p_now timestamp with time zone
)
  RETURNS TABLE (
    workspace_id   uuid,
    owner_user_id  uuid,
    cadence        text,
    include_admins boolean,
    time_zone      text,
    period_start   timestamp with time zone,
    period_end     timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Workspaces whose spend report is due at p_now (private.spend_report_period in their
  -- billing_time_zone) and has not been handled for that period yet (workspace_spend_report_runs).
  -- A workspace without settings uses the defaults: weekly, owners only, UTC. Periods are worked
  -- out once per cadence and zone in use, not per workspace, so an idle tick is one pass over
  -- workspaces with a hash join. A period counts as handled when the last handled one covers its
  -- middle: changing billing_time_zone moves the same local day, week or month to another UTC
  -- instant, which is not a new period, while the next real period starts at or after its end.
  with settings as materialized (
    select
      workspace.id,
      workspace.owner_user_id,
      coalesce(stored.spend_report_cadence, 'weekly') as cadence,
      coalesce(stored.spend_report_include_admins, false) as include_admins,
      coalesce(stored.billing_time_zone, 'UTC') as time_zone
    from public.workspaces workspace
    left join public.workspace_settings stored on stored.workspace_id = workspace.id
  ),
  due as materialized (
    select zone.cadence, zone.time_zone, report.period_start, report.period_end
    from (select distinct settings.cadence, settings.time_zone from settings where settings.cadence <> 'off') zone
    cross join lateral private.spend_report_period(zone.cadence, zone.time_zone, p_now) report
    where report.due
  )
  select settings.id, settings.owner_user_id, settings.cadence, settings.include_admins, settings.time_zone,
    due.period_start, due.period_end
  from settings
  join due on due.cadence = settings.cadence and due.time_zone = settings.time_zone
  left join public.workspace_spend_report_runs run
    on run.workspace_id = settings.id and run.cadence = settings.cadence
  where run.period_start is null
    or (run.period_start < due.period_start
      and run.period_end <= due.period_start + (due.period_end - due.period_start) / 2);
$function$;

COMMENT ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) IS 'Workspaces whose daily, weekly or monthly spend report is due at p_now in their billing_time_zone and not yet handled for that period.';

REVOKE ALL ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_report_facts (
  p_workspace_id uuid,
  p_cadence      text,
  p_now          timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Everything one workspace's spend report says, for the last complete daily, weekly or monthly
  -- period before p_now in its billing_time_zone (private.spend_report_period). Every figure is
  -- summed here; the email and the routed message only format it.
  --   * Totals (spend, requests, tokens) and top keys and models: the dashboard's exact usage
  --     overview (public.get_private_usage_overview, rollup plus hours the outbox has yet to
  --     rebuild), so they match the usage page and the weekly mobile digest. The period before
  --     comes from private.mobile_week_usage, the digest's own summary of the same overview.
  --   * Top members and departments: attributed the way spend rules count them (rollup by
  --     actor_user_id plus successful async jobs and realtime sessions; departments through
  --     private.spend_department_totals, which follows department_spend_attribution, so a person
  --     in two departments counts toward both unless the workspace counts primary ones only).
  --   * Forecast: the current billing month (in billing_time_zone) projected the way forecast spend
  --     rules project it (private.spend_rule_values): spend so far x month length / time elapsed,
  --     from 72 hours into the month; 0 without spend.
  --   * Runway: the available balance (balance - reserved) over the burn of the last 7 days, the
  --     way balance spend rules compute it (private.spend_balance_rule_values). Null without a
  --     wallet; runway_days null without spend.
  --   * Alerts: spend_alert events queued in the period, per rule. Blocks: spend blocks started in
  --     the period or active at any point of it.
  -- Null when the workspace does not exist or the cadence is not daily, weekly or monthly.
  with ws as (
    select
      workspace.id,
      coalesce(nullif(btrim(workspace.name), ''), 'Your workspace') as name,
      coalesce(settings.billing_time_zone, 'UTC') as time_zone,
      coalesce(settings.department_spend_attribution, 'all') as attribution
    from public.workspaces workspace
    left join public.workspace_settings settings on settings.workspace_id = workspace.id
    where workspace.id = p_workspace_id
  ),
  period as materialized (
    select ws.*, report.period_start, report.period_end, report.previous_start, report.previous_end,
      month.period_start as month_start, month.period_end as month_end
    from ws
    cross join lateral private.spend_report_period(p_cadence, ws.time_zone, p_now) report
    cross join lateral private.spend_rule_period('month', ws.time_zone, p_now) month
  ),
  cells as materialized (
    select
      nullif(overview.cell ->> 'modelId', '') as model_id,
      nullif(overview.cell ->> 'keyId', '')::uuid as key_id,
      coalesce((overview.cell ->> 'requests')::numeric, 0) as requests,
      coalesce((overview.cell ->> 'successfulRequests')::numeric, 0) as successful_requests,
      coalesce((overview.cell ->> 'costNanos')::numeric, 0) as cost_nanos,
      coalesce((overview.cell ->> 'tokens')::numeric, 0) as tokens,
      coalesce((overview.cell ->> 'inputTokens')::numeric, 0) as input_tokens,
      coalesce((overview.cell ->> 'outputTokens')::numeric, 0) as output_tokens
    from period
    -- The overview's upper bound is inclusive, as private.mobile_week_usage calls it.
    cross join lateral jsonb_array_elements(public.get_private_usage_overview(
      p_workspace_id, period.period_start, period.period_end - interval '1 microsecond', null, period.time_zone
    )) as overview(cell)
  ),
  totals as (
    select
      coalesce(sum(cells.cost_nanos), 0) as spend_nanos,
      coalesce(sum(cells.requests), 0) as requests,
      coalesce(sum(cells.successful_requests), 0) as successful_requests,
      coalesce(sum(cells.tokens), 0) as tokens,
      coalesce(sum(cells.input_tokens), 0) as input_tokens,
      coalesce(sum(cells.output_tokens), 0) as output_tokens
    from cells
  ),
  previous as (
    select
      coalesce((usage.summary ->> 'spendNanos')::numeric, 0) as spend_nanos,
      coalesce((usage.summary ->> 'requests')::numeric, 0) as requests,
      coalesce((usage.summary ->> 'tokens')::numeric, 0) as tokens
    from period
    cross join lateral (
      select private.mobile_week_usage(p_workspace_id, period.previous_start, period.previous_end, period.time_zone) as summary
    ) usage
  ),
  top_keys as (
    select keyed.key_id, key.name, keyed.spend_nanos, keyed.requests
    from (
      select cells.key_id, sum(cells.cost_nanos) as spend_nanos, sum(cells.requests) as requests
      from cells
      group by cells.key_id
      having sum(cells.cost_nanos) > 0
    ) keyed
    left join public.keys key on key.id = keyed.key_id and key.workspace_id = p_workspace_id
    order by keyed.spend_nanos desc, keyed.requests desc, keyed.key_id nulls last
    limit 5
  ),
  top_models as (
    select modelled.model_id, coalesce(catalogue.name, modelled.model_id) as name, modelled.spend_nanos, modelled.requests
    from (
      select cells.model_id, sum(cells.cost_nanos) as spend_nanos, sum(cells.requests) as requests
      from cells
      where cells.model_id is not null
      group by cells.model_id
      having sum(cells.cost_nanos) > 0
    ) modelled
    left join public.v2_models catalogue on catalogue.model_slug = modelled.model_id
    order by modelled.spend_nanos desc, modelled.requests desc, modelled.model_id
    limit 5
  ),
  spend as materialized (
    -- One read of the spend spend rules count (rollup plus successful async jobs and realtime
    -- sessions), from the earliest of the report period, the billing month and the last 7 days,
    -- up to p_now. Members, the month so far and the 7-day burn are all summed from it.
    select usage.at, usage.actor_user_id, usage.cost_nanos, usage.requests
    from period
    cross join lateral (
      select rollup.bucket_start as at, rollup.actor_user_id, rollup.cost_nanos, rollup.requests::numeric as requests
      from public.v2_private_usage_15m rollup
      where rollup.workspace_id = p_workspace_id
        and rollup.bucket_start >= least(period.period_start, period.month_start, p_now - interval '168 hours')
        and rollup.bucket_start < p_now
      union all
      -- gateway_requests_async_spend_idx
      select request.created_at, coalesce(request.oauth_user_id, key.oauth_user_id, key.created_by), coalesce(request.cost_nanos, 0)::numeric, 1::numeric
      from public.gateway_requests request
      left join public.keys key on key.id = request.key_id
      where request.success is true
        and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
        and request.workspace_id = p_workspace_id
        and request.created_at >= least(period.period_start, period.month_start, p_now - interval '168 hours')
        and request.created_at < p_now
    ) usage
  ),
  member_usage as (
    select spend.actor_user_id, sum(spend.cost_nanos) as spend_nanos, sum(spend.requests) as requests
    from spend
    cross join period
    where spend.actor_user_id is not null
      and spend.at >= period.period_start
      and spend.at < period.period_end
    group by spend.actor_user_id
    having sum(spend.cost_nanos) > 0
  ),
  spend_sums as materialized (
    select
      coalesce(sum(spend.cost_nanos) filter (where spend.at >= period.month_start), 0) as month_nanos,
      coalesce(sum(spend.cost_nanos) filter (where spend.at >= p_now - interval '168 hours'), 0) as burn_nanos
    from period
    left join spend on true
    group by period.month_start
  ),
  top_members as (
    select member_usage.actor_user_id, nullif(btrim(person.display_name), '') as display_name,
      nullif(btrim(account.email), '') as email, member_usage.spend_nanos, member_usage.requests
    from member_usage
    left join public.users person on person.user_id = member_usage.actor_user_id
    left join auth.users account on account.id = member_usage.actor_user_id
    order by member_usage.spend_nanos desc, member_usage.requests desc, member_usage.actor_user_id
    limit 5
  ),
  top_departments as (
    select totals.department_id, department.name, totals.cost_nanos as spend_nanos, totals.requests
    from period
    cross join lateral private.spend_department_totals(p_workspace_id, period.period_start, period.period_end) totals
    left join public.workspace_departments department
      on department.id = totals.department_id and department.workspace_id = p_workspace_id
    where totals.cost_nanos > 0
    order by totals.cost_nanos desc, totals.requests desc, totals.department_id
    limit 5
  ),
  month_spend as (
    select period.month_start, period.month_end, spend_sums.month_nanos as spend_nanos,
      period.month_start + interval '72 hours' as forecast_from,
      (extract(epoch from p_now) - extract(epoch from period.month_start)) * 1000 as elapsed_ms,
      (extract(epoch from period.month_end) - extract(epoch from period.month_start)) * 1000 as length_ms
    from period
    cross join spend_sums
  ),
  forecast as materialized (
    select month_spend.*,
      case
        when p_now < month_spend.forecast_from then null
        when month_spend.spend_nanos <= 0 then 0::numeric
        else round(month_spend.spend_nanos * month_spend.length_ms / month_spend.elapsed_ms)
      end as projected_nanos
    from month_spend
  ),
  runway as materialized (
    select wallet.balance_nanos, wallet.reserved_nanos, wallet.available_nanos, burned.burn_nanos,
      burned.burn_nanos * 24 / 168 as burn_per_day_nanos,
      case when burned.burn_nanos > 0 then round(wallet.available_nanos / (burned.burn_nanos * 24 / 168), 2) end as runway_days
    from (
      select w.balance_nanos, coalesce(w.reserved_nanos, 0) as reserved_nanos,
        greatest(w.balance_nanos - coalesce(w.reserved_nanos, 0), 0) as available_nanos
      from public.wallets w
      where w.workspace_id = p_workspace_id
    ) wallet
    cross join (select spend_sums.burn_nanos from spend_sums) burned
  ),
  alerts as (
    -- email_outbox_workspace_id_idx
    select event.payload ->> 'rule_id' as rule_id, max(event.payload ->> 'rule_name') as rule_name,
      max(event.payload ->> 'metric') as metric, count(*) as fired, max(event.created_at) as last_at,
      (array_agg(coalesce(event.payload ->> 'title', event.subject) order by event.created_at desc, event.id desc))[1] as last_title
    from period
    join public.email_outbox event
      on event.workspace_id = p_workspace_id
      and event.kind = 'spend_alert'
      and event.created_at >= period.period_start
      and event.created_at < period.period_end
    group by event.payload ->> 'rule_id'
  ),
  blocks as (
    select block.id, block.rule_id, coalesce(rule.name, 'Deleted rule') as rule_name, block.scope_type, block.scope_id,
      private.spend_scope_label(p_workspace_id, block.scope_type, block.scope_id) as scope_label,
      block.started_at, block.lifted_at, block.lift_reason, block.resets_at, block.limit_nanos,
      block.lifted_at is null as active_now,
      block.started_at >= period.period_start as started_in_period
    from period
    join public.workspace_spend_blocks block
      on block.workspace_id = p_workspace_id
      and block.started_at < period.period_end
      and (block.lifted_at is null or block.lifted_at >= period.period_start)
    left join public.workspace_spend_rules rule on rule.id = block.rule_id
  ),
  facts as (
    select
      period.*,
      totals.*,
      previous.spend_nanos as previous_spend_nanos,
      previous.requests as previous_requests,
      previous.tokens as previous_tokens,
      case when previous.spend_nanos > 0 then round((totals.spend_nanos - previous.spend_nanos) * 100 / previous.spend_nanos, 1) end
        as spend_change_percent,
      (period.period_start at time zone period.time_zone) as local_start,
      (period.period_end at time zone period.time_zone) as local_end,
      case p_cadence when 'daily' then 'day' when 'weekly' then 'week' else 'month' end as unit
    from period
    cross join totals
    cross join previous
  ),
  labelled as (
    select facts.*,
      case p_cadence
        when 'daily' then to_char(facts.local_start, 'Mon FMDD, YYYY')
        when 'weekly' then to_char(facts.local_start, 'Mon FMDD') || ' – ' || to_char(facts.local_end - interval '1 day', 'Mon FMDD, YYYY')
        else to_char(facts.local_start, 'FMMonth YYYY')
      end as label,
      to_char(forecast.month_start at time zone facts.time_zone, 'FMMonth') as month_label,
      to_char(forecast.forecast_from at time zone facts.time_zone, 'Mon FMDD') as forecast_from_label
    from facts
    cross join forecast
  ),
  body as (
    select labelled.*,
      labelled.name || ' ' || case p_cadence when 'daily' then 'daily' when 'weekly' then 'weekly' else 'monthly' end
        || ' spend: ' || private.workspace_push_usd(labelled.spend_nanos) || ' (' || labelled.label || ')' as title,
      concat_ws(E'\n',
        'Spent ' || private.workspace_push_usd(labelled.spend_nanos)
          || case p_cadence when 'daily' then ' on ' when 'weekly' then ' in the week of ' else ' in ' end || labelled.label
          || case
            when labelled.spend_change_percent is null then ', with no spend the ' || labelled.unit || ' before.'
            when labelled.spend_change_percent > 0 then ', up ' || trim_scale(labelled.spend_change_percent) || '% on the ' || labelled.unit || ' before ('
              || private.workspace_push_usd(labelled.previous_spend_nanos) || ').'
            when labelled.spend_change_percent < 0 then ', down ' || trim_scale(abs(labelled.spend_change_percent)) || '% on the ' || labelled.unit || ' before ('
              || private.workspace_push_usd(labelled.previous_spend_nanos) || ').'
            else ', the same as the ' || labelled.unit || ' before.'
          end
          || ' ' || private.mobile_push_compact_number(labelled.requests) || case when labelled.requests = 1 then ' request, ' else ' requests, ' end
          || private.mobile_push_compact_number(labelled.tokens) || ' tokens.',
        (select 'Top models: ' || string_agg(top_models.name || ' ' || private.workspace_push_usd(top_models.spend_nanos), ', '
            order by top_models.spend_nanos desc, top_models.requests desc, top_models.model_id) || '.'
          from (select * from top_models order by spend_nanos desc, requests desc, model_id limit 3) top_models
          having count(*) > 0),
        (select 'Top keys: ' || string_agg(coalesce(top_keys.name, 'No API key') || ' ' || private.workspace_push_usd(top_keys.spend_nanos), ', '
            order by top_keys.spend_nanos desc, top_keys.requests desc, top_keys.key_id nulls last) || '.'
          from (select * from top_keys order by spend_nanos desc, requests desc, key_id nulls last limit 3) top_keys
          having count(*) > 0),
        (select case
            when forecast.projected_nanos is null then labelled.month_label || ' forecast: from ' || labelled.forecast_from_label
              || ' (' || private.workspace_push_usd(forecast.spend_nanos) || ' so far).'
            else labelled.month_label || ' forecast: ' || private.workspace_push_usd(forecast.projected_nanos)
              || ' (' || private.workspace_push_usd(forecast.spend_nanos) || ' so far).'
          end from forecast),
        (select 'Balance: ' || private.workspace_push_usd(runway.available_nanos)
            || case when runway.runway_days is not null
              then ', about ' || trim_scale(round(runway.runway_days, case when runway.runway_days < 10 then 1 else 0 end)) || ' days at the last 7 days'' pace.'
              else '.' end
          from runway),
        (select 'Spend alerts: ' || sum(alerts.fired) || ' fired.' from alerts having count(*) > 0),
        (select 'Spend blocks: ' || count(*) filter (where blocks.active_now) || ' active, '
            || count(*) filter (where blocks.started_in_period) || ' started.'
          from blocks having count(*) > 0),
        'Usage: https://phaseo.app/settings/usage/overview'
      ) as message
    from labelled
  )
  select jsonb_build_object(
    'version', 1,
    'workspace_id', body.id,
    'workspace_name', body.name,
    'cadence', p_cadence,
    'time_zone', body.time_zone,
    'title', body.title,
    'message', body.message,
    'period', jsonb_build_object('start', body.period_start, 'end', body.period_end, 'label', body.label,
      'local_start', to_char(body.local_start, 'YYYY-MM-DD'), 'local_end', to_char(body.local_end - interval '1 day', 'YYYY-MM-DD')),
    'previous_period', jsonb_build_object('start', body.previous_start, 'end', body.previous_end),
    'totals', jsonb_build_object('spend_nanos', body.spend_nanos, 'requests', body.requests, 'successful_requests', body.successful_requests,
      'tokens', body.tokens, 'input_tokens', body.input_tokens, 'output_tokens', body.output_tokens),
    'previous_totals', jsonb_build_object('spend_nanos', body.previous_spend_nanos, 'requests', body.previous_requests, 'tokens', body.previous_tokens),
    'change', jsonb_build_object('spend_nanos', body.spend_nanos - body.previous_spend_nanos, 'spend_percent', body.spend_change_percent),
    'top_keys', coalesce((select jsonb_agg(jsonb_build_object('id', top_keys.key_id, 'name', top_keys.name,
        'spend_nanos', top_keys.spend_nanos, 'requests', top_keys.requests)
      order by top_keys.spend_nanos desc, top_keys.requests desc, top_keys.key_id nulls last) from top_keys), '[]'::jsonb),
    'top_models', coalesce((select jsonb_agg(jsonb_build_object('id', top_models.model_id, 'name', top_models.name,
        'spend_nanos', top_models.spend_nanos, 'requests', top_models.requests)
      order by top_models.spend_nanos desc, top_models.requests desc, top_models.model_id) from top_models), '[]'::jsonb),
    'top_members', coalesce((select jsonb_agg(jsonb_build_object('user_id', top_members.actor_user_id,
        'name', coalesce(top_members.display_name, top_members.email), 'email', top_members.email,
        'spend_nanos', top_members.spend_nanos, 'requests', top_members.requests)
      order by top_members.spend_nanos desc, top_members.requests desc, top_members.actor_user_id) from top_members), '[]'::jsonb),
    'top_departments', coalesce((select jsonb_agg(jsonb_build_object('id', top_departments.department_id, 'name', top_departments.name,
        'spend_nanos', top_departments.spend_nanos, 'requests', top_departments.requests)
      order by top_departments.spend_nanos desc, top_departments.requests desc, top_departments.department_id) from top_departments), '[]'::jsonb),
    'department_attribution', body.attribution,
    'forecast', (select jsonb_build_object('month_start', forecast.month_start, 'month_end', forecast.month_end,
        'month_label', body.month_label, 'from', forecast.forecast_from, 'spend_nanos', forecast.spend_nanos,
        'projected_nanos', forecast.projected_nanos) from forecast),
    'runway', (select jsonb_build_object('balance_nanos', runway.balance_nanos, 'reserved_nanos', runway.reserved_nanos,
        'available_nanos', runway.available_nanos, 'window_hours', 168, 'burn_nanos', runway.burn_nanos,
        'burn_per_day_nanos', round(runway.burn_per_day_nanos), 'runway_days', runway.runway_days,
        'auto_top_up', private.workspace_auto_top_up_covers(p_workspace_id)) from runway),
    'alerts', jsonb_build_object(
      'fired', coalesce((select sum(alerts.fired) from alerts), 0),
      'rules', coalesce((select jsonb_agg(jsonb_build_object('rule_id', alerts.rule_id, 'rule_name', alerts.rule_name, 'metric', alerts.metric,
          'fired', alerts.fired, 'last_at', alerts.last_at, 'last_title', alerts.last_title)
        order by alerts.fired desc, alerts.last_at desc, alerts.rule_id)
        from (select * from alerts order by fired desc, last_at desc, rule_id limit 5) alerts), '[]'::jsonb)),
    'blocks', jsonb_build_object(
      'active', (select count(*) filter (where blocks.active_now) from blocks),
      'started', (select count(*) filter (where blocks.started_in_period) from blocks),
      'items', coalesce((select jsonb_agg(jsonb_build_object('block_id', blocks.id, 'rule_id', blocks.rule_id, 'rule_name', blocks.rule_name,
          'scope_type', blocks.scope_type, 'scope_label', blocks.scope_label, 'started_at', blocks.started_at, 'lifted_at', blocks.lifted_at,
          'lift_reason', blocks.lift_reason, 'resets_at', blocks.resets_at, 'limit_nanos', blocks.limit_nanos, 'active', blocks.active_now)
        order by blocks.active_now desc, blocks.started_at desc, blocks.id)
        from (select * from blocks order by active_now desc, started_at desc, id limit 5) blocks), '[]'::jsonb)),
    'url', 'https://phaseo.app/settings/usage/overview',
    'settings_url', 'https://phaseo.app/settings/notifications#spend-alerts',
    'generated_at', p_now
  )
  from body;
$function$;

COMMENT ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) IS 'One workspace''s spend report for the last complete daily, weekly or monthly period before p_now in its billing_time_zone: totals and change (the usage overview), top keys, models, members and departments, the month forecast, runway, spend alerts and blocks, plus the routed title and message. Every figure is aggregated in SQL.';

REVOKE ALL ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_facts"(uuid, text, timestamp with time zone) TO "service_role";

CREATE OR REPLACE FUNCTION public.queue_spend_reports (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit integer                  DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Queues the spend reports that are due at p_now. A workspace's report is due from 09:00 to 21:00
-- in its billing_time_zone on the first day after each period (private.spend_report_period):
-- daily for the day before, weekly on Monday for the previous ISO week, monthly on the 1st for the
-- previous month; spend_report_cadence 'off' sends none. Each workspace, cadence and period is
-- handled once (workspace_spend_report_runs):
--   1. Due workspaces with no spend in the rollup and no usage still waiting in the analytics
--      outbox for the period are recorded as skipped in one statement, without computing a report.
--   2. Up to p_limit of the rest get private.spend_report_facts. A report whose total spend is 0
--      (free models only) is skipped too. Otherwise it queues, in email_outbox:
--      * one routed spend_report event (the workspace's spend_report routes, delivered by the
--        notification delivery job), dedupe key spend_report:<workspace>:<cadence>:<period start>;
--      * one spend_report_email per recipient (the legacy email drain sends these): the owner and
--        every member with the owner role, plus admins when spend_report_include_admins is on,
--        less anyone who unsubscribed (workspace_spend_report_recipients.opted_out_at), dedupe key
--        <event key>:email:<user id>. Each payload carries that person's unsubscribe token.
--      Every insert is ON CONFLICT (dedupe_key) DO NOTHING, so a retry or a re-run never sends a
--      report twice.
-- One call at a time (advisory lock); a concurrent call returns skipped_locked. Runs behind
-- SPEND_REPORTS_ENABLED. Service role only.
declare
  v_lock boolean;
  v_skipped_quiet integer := 0;
  v_skipped_zero integer := 0;
  v_queued integer := 0;
  v_emails integer := 0;
  v_due integer := 0;
  v_reports jsonb := '[]'::jsonb;
  v_candidate record;
  v_facts jsonb;
  v_key text;
  v_event_id uuid;
  v_owner_email text;
  v_recipients integer;
begin
  if p_now is null then
    raise exception 'invalid_spend_report_time' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_spend_report_limit' using errcode = '22023';
  end if;

  v_lock := pg_try_advisory_xact_lock(hashtextextended('public.queue_spend_reports', 0));
  if not v_lock then
    return jsonb_build_object('skipped_locked', true, 'due', 0, 'quiet', 0, 'zero_spend', 0, 'queued', 0, 'emails', 0, 'reports', '[]'::jsonb);
  end if;

  -- 1. Quiet workspaces: nothing in the rollup and nothing waiting to be rolled up.
  with due as (
    select candidate.*
    from private.spend_report_due_workspaces(p_now) candidate
  ),
  quiet as (
    insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
    select due.workspace_id, due.cadence, due.period_start, due.period_end, 'skipped', 0, 0, null
    from due
    where not exists (
        select 1 from public.v2_private_usage_15m rollup
        where rollup.workspace_id = due.workspace_id
          and rollup.bucket_start >= due.period_start
          and rollup.bucket_start < due.period_end
          and rollup.cost_nanos > 0
      )
      and not exists (
        select 1 from public.v2_analytics_outbox outbox
        where outbox.workspace_id = due.workspace_id
          and outbox.status in ('pending', 'failed')
          and outbox.occurred_at >= due.period_start
          and outbox.occurred_at < due.period_end
      )
      and not exists (
        -- gateway_requests_async_spend_idx: async jobs count toward departments and members.
        select 1 from public.gateway_requests request
        where request.success is true
          and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
          and request.workspace_id = due.workspace_id
          and request.created_at >= due.period_start
          and request.created_at < due.period_end
          and request.cost_nanos > 0
      )
    on conflict (workspace_id, cadence) do update
      set period_start = excluded.period_start, period_end = excluded.period_end, status = 'skipped',
        spend_nanos = 0, recipients = 0, event_id = null, updated_at = now()
      where run.period_start < excluded.period_start
    returning 1
  )
  select count(*) into v_skipped_quiet from quiet;

  -- 2. The rest, oldest period first, then the workspaces whose last handled period is oldest (or
  --    that have none). A backlog bigger than one due window starts next time with the workspaces
  --    it missed, instead of the same lowest workspace ids again.
  for v_candidate in
    select candidate.*
    from private.spend_report_due_workspaces(p_now) candidate
    left join public.workspace_spend_report_runs last_run
      on last_run.workspace_id = candidate.workspace_id and last_run.cadence = candidate.cadence
    order by candidate.period_start, last_run.period_start nulls first, candidate.workspace_id
    limit p_limit
  loop
    v_due := v_due + 1;
    v_facts := private.spend_report_facts(v_candidate.workspace_id, v_candidate.cadence, p_now);

    if v_facts is null or coalesce((v_facts #>> '{totals,spend_nanos}')::numeric, 0) <= 0 then
      insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
      values (v_candidate.workspace_id, v_candidate.cadence, v_candidate.period_start, v_candidate.period_end, 'skipped', 0, 0, null)
      on conflict (workspace_id, cadence) do update
        set period_start = excluded.period_start, period_end = excluded.period_end, status = 'skipped',
          spend_nanos = 0, recipients = 0, event_id = null, updated_at = now();
      v_skipped_zero := v_skipped_zero + 1;
      continue;
    end if;

    v_key := 'spend_report:' || v_candidate.workspace_id || ':' || v_candidate.cadence || ':'
      || to_char(v_candidate.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');

    select nullif(btrim(account.email), '') into v_owner_email
    from auth.users account where account.id = v_candidate.owner_user_id;

    v_event_id := null;
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    values ('spend_report', 'spend_report', coalesce(v_owner_email, ''), v_facts ->> 'title', v_candidate.workspace_id,
      v_candidate.owner_user_id, v_facts, v_key)
    on conflict (dedupe_key) do nothing
    returning id into v_event_id;

    -- Recipients get a stable unsubscribe token the first time they are emailed.
    insert into public.workspace_spend_report_recipients (workspace_id, user_id)
    select v_candidate.workspace_id, person.user_id
    from private.spend_report_people(v_candidate.workspace_id, v_candidate.include_admins) person
    on conflict (workspace_id, user_id) do nothing;

    with sent as (
      insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
      select 'spend_report_email', 'spend_report', person.email, v_facts ->> 'title', v_candidate.workspace_id, person.user_id,
        v_facts || jsonb_build_object('recipient', jsonb_build_object('user_id', person.user_id, 'role', person.role,
          'unsubscribe_token', recipient.unsubscribe_token)),
        v_key || ':email:' || person.user_id
      from private.spend_report_people(v_candidate.workspace_id, v_candidate.include_admins) person
      join public.workspace_spend_report_recipients recipient
        on recipient.workspace_id = v_candidate.workspace_id and recipient.user_id = person.user_id
      where recipient.opted_out_at is null
        and person.email is not null
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*) into v_recipients from sent;

    insert into public.workspace_spend_report_runs as run (workspace_id, cadence, period_start, period_end, status, spend_nanos, recipients, event_id)
    values (v_candidate.workspace_id, v_candidate.cadence, v_candidate.period_start, v_candidate.period_end, 'queued',
      (v_facts #>> '{totals,spend_nanos}')::numeric, v_recipients, v_event_id)
    on conflict (workspace_id, cadence) do update
      set period_start = excluded.period_start, period_end = excluded.period_end, status = 'queued',
        spend_nanos = excluded.spend_nanos, recipients = excluded.recipients, event_id = coalesce(excluded.event_id, run.event_id),
        updated_at = now();

    v_queued := v_queued + 1;
    v_emails := v_emails + v_recipients;
    v_reports := v_reports || jsonb_build_array(jsonb_build_object(
      'workspace_id', v_candidate.workspace_id, 'cadence', v_candidate.cadence, 'period_start', v_candidate.period_start,
      'event_id', v_event_id, 'dedupe_key', v_key, 'emails', v_recipients,
      'spend_nanos', (v_facts #>> '{totals,spend_nanos}')::numeric));
  end loop;

  return jsonb_build_object(
    'skipped_locked', false,
    'due', v_due + v_skipped_quiet,
    'quiet', v_skipped_quiet,
    'zero_spend', v_skipped_zero,
    'queued', v_queued,
    'emails', v_emails,
    'reports', v_reports
  );
end;
$function$;

COMMENT ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) IS 'Queues the spend reports due at p_now (09:00 to 21:00 in each workspace''s billing_time_zone on the first day after a daily, weekly or monthly period): one routed spend_report event and one spend_report_email per subscribed owner (and admin when included), skipping periods without spend. Each workspace, cadence and period is handled once; dedupe keys make retries safe. Service role only.';

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."queue_spend_reports"(timestamp with time zone, integer) FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_spend_report_subscription (
  p_token      uuid,
  p_subscribed boolean DEFAULT NULL::boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The unsubscribe link in a spend report email (and its RFC 8058 one-click List-Unsubscribe).
-- The unguessable token names one person and one workspace. p_subscribed false unsubscribes them
-- from that workspace's report emails and cancels any of those emails still waiting in the outbox;
-- true subscribes them again; null only reads. Other emails, other workspaces' reports and the
-- routed spend_report events are untouched. Repeating it is harmless. Returns null for an unknown
-- token, otherwise { workspace_name, subscribed }.
declare
  v_workspace_id uuid;
  v_user_id uuid;
  v_opted_out_at timestamp with time zone;
begin
  if p_token is null then
    return null;
  end if;

  if p_subscribed is null then
    select recipient.workspace_id, recipient.user_id, recipient.opted_out_at
    into v_workspace_id, v_user_id, v_opted_out_at
    from public.workspace_spend_report_recipients recipient
    where recipient.unsubscribe_token = p_token;
  else
    update public.workspace_spend_report_recipients recipient
    set opted_out_at = case when p_subscribed then null else coalesce(recipient.opted_out_at, now()) end,
      updated_at = now()
    where recipient.unsubscribe_token = p_token
    returning recipient.workspace_id, recipient.user_id, recipient.opted_out_at
    into v_workspace_id, v_user_id, v_opted_out_at;
  end if;

  if v_workspace_id is null then
    return null;
  end if;

  if p_subscribed is false then
    update public.email_outbox event
    set attempts = 5, last_error = 'unsubscribed'
    where event.user_id = v_user_id
      and event.workspace_id = v_workspace_id
      and event.kind = 'spend_report_email'
      and event.sent_at is null
      and event.attempts < 5;
  end if;

  return jsonb_build_object(
    'workspace_name', (select coalesce(nullif(btrim(workspace.name), ''), 'your workspace') from public.workspaces workspace where workspace.id = v_workspace_id),
    'subscribed', v_opted_out_at is null
  );
end;
$function$;

COMMENT ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) IS 'Reads (null), unsubscribes (false) or resubscribes (true) the person and workspace named by a spend report unsubscribe token. Unsubscribing also cancels their unsent report emails for that workspace. Null for an unknown token. Service role only (the public web-api route behind the email link).';

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_spend_report_subscription"(uuid, boolean) FROM "anon", "authenticated";
