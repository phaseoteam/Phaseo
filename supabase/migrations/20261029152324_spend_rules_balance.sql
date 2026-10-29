-- phaseo:allow-destructive-migration reason: re-creates public.sweep_spend_rules, whose dirty-set claim is a DELETE from workspace_spend_rule_dirty (unchanged from the previous definition). No data is deleted by this migration.

-- Spend rules balance (PR 9 of the spend rules stack): balance rules, and the low-balance email off
-- the request path.
-- * private.spend_rule_evaluable: balance rules (workspace scope, rolling) are evaluated.
-- * private.spend_balance_rule_values / private.spend_balance_alert_text: available balance
--   (balance - reserved), burn over window_hours (15-minute rollup plus async jobs), runway, and
--   the alert text, shared by the evaluator and the preview.
-- * private.evaluate_workspace_spend_rules: balance rules fire once per drop (armed/unarmed state
--   in workspace_spend_rule_state, cooldown_minutes), never while auto top-up is working.
-- * public.sweep_spend_rules: a 15-minute slice of workspaces with balance rules, since a balance
--   moves without usage.
-- * public.preview_workspace_spend_rule: balance, burn per day and runway for balance rules.
-- * private.workspace_auto_top_up_covers: the "auto top-up is working" test, now shared by the
--   low-balance push sweep (re-created, otherwise unchanged), the new email sweep and balance rules.
-- * public.sweep_low_balance_emails + workspace_low_balance_email_state (+ a partial index on
--   workspace_settings): the low-balance email, queued by the scheduled job instead of after
--   every charged request.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE TABLE "public"."workspace_low_balance_email_state" (
  "workspace_id"    uuid                     NOT NULL,
  "armed"           boolean                  NOT NULL,
  "balance_nanos"   bigint                   NOT NULL,
  "threshold_nanos" bigint                   NOT NULL,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "last_alert_at"   timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_low_balance_email_state_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_low_balance_email_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_low_balance_email_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_low_balance_email_state"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."armed" IS 'True while the balance is above the low-balance email threshold. A sweep that finds it at or below the threshold emails (unless auto top-up is working or the six-hour cooldown holds) and clears it; a sweep that finds it back above sets it again.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."balance_nanos" IS 'Wallet balance when armed last changed, or when the workspace was first seen.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."changed_at" IS 'When armed last changed, or when the workspace was first seen. A sweep writes a row only when armed changes, so an idle sweep writes nothing.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."last_alert_at" IS 'When the last low-balance email was queued. A drop while auto top-up is working is recorded without an email and leaves this unchanged.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."threshold_nanos" IS 'The workspace''s low_balance_email_threshold_nanos the balance was compared with then.';

COMMENT ON TABLE "public"."workspace_low_balance_email_state" IS 'Low-balance email state of each workspace with low-balance emails on, kept by sweep_low_balance_emails with the same armed/unarmed rules as workspace_low_balance_push_state: a drop to or below the threshold is emailed once, and the email is armed again only once the balance is back above it. A separate table because the push watches a different set of workspaces (owners and admins with push on) at a different threshold ($5 without one), so the two can be armed differently. Rows are kept while emails are off, so turning them back on does not resend a drop already emailed.';

REVOKE ALL ON TABLE "public"."workspace_low_balance_email_state" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_low_balance_email_state" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_low_balance_email_state" FROM "anon", "authenticated";

CREATE INDEX workspace_settings_low_balance_email_idx ON public.workspace_settings USING btree (workspace_id)
  WHERE low_balance_email_enabled;

CREATE OR REPLACE FUNCTION private.workspace_auto_top_up_covers (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Whether the workspace's auto top-up is on and working, so a low balance refills by itself and
  -- a drop is recorded without an alert. The one test the low-balance push sweep
  -- (sweep_low_balance_pushes), the low-balance email sweep (sweep_low_balance_emails) and
  -- balance spend rules (evaluate_workspace_spend_rules) share, so they agree.
  -- Working means: enabled with at least $1 to add (smaller amounts are skipped without an alert),
  -- a trigger above $0 (a $0 trigger never fires), failure alerts on (a failed top-up has its own
  -- email and push), and no failed top-up since the last card payment. No wallet: false.
  select coalesce((
    select w.auto_top_up_enabled
      and w.auto_top_up_amount >= 1000000000
      and w.low_balance_threshold > 0
      and s.auto_top_up_failure_email_enabled is distinct from false
      and not exists (
        select 1
        from (
          select f.occurred_at
          from public.workspace_notification_events f
          where f.workspace_id = w.workspace_id and f.kind = 'auto_top_up_failed'
          order by f.occurred_at desc
          limit 1
        ) failed
        where not exists (
          select 1
          from public.credit_ledger l
          where l.workspace_id = w.workspace_id
            and l.ref_type = 'Stripe_Payment_Intent'
            and l.amount_nanos > 0
            and l.created_at > failed.occurred_at
        )
      )
    from public.wallets w
    left join public.workspace_settings s on s.workspace_id = w.workspace_id
    where w.workspace_id = p_workspace_id
  ), false);
$function$;

COMMENT ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) IS 'True while the workspace''s auto top-up is on and working (enabled, at least $1 to add, a trigger above $0, failure alerts on, no failed top-up since the last card payment). Low-balance pushes, low-balance emails and balance spend rules record a drop without alerting while it is.';

REVOKE ALL ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."workspace_auto_top_up_covers"(uuid) TO "service_role";

CREATE OR REPLACE FUNCTION public.sweep_low_balance_pushes (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Pushes a low balance once per drop to owners and admins, whatever the workspace's low-balance
-- email setting. The mobile push job runs it every five minutes, just before the workspace fan-out.
--   * Only workspaces where an owner or admin has push on, the money category on and an active
--     device are read: the wallet balance against the workspace's low-balance threshold, or $5
--     without one (an alert switched off in the web settings stores 0).
--   * A workspace is armed while its balance is above the threshold. Found armed at or below it,
--     that is a drop: one low_balance event for the fan-out, and it stays unarmed until a sweep
--     finds the balance back above the threshold (a top-up or credit). First seen, it is armed
--     only if above, so a workspace that never had credits is never told.
--   * While auto top-up is on and working, a drop is recorded but not pushed: the gateway refills
--     the wallet, and a failed top-up has its own push. Working means enabled with at least $1 to
--     add (smaller amounts are skipped without an alert) and a trigger above $0 (a $0 trigger never
--     fires), failure alerts on (the failure push comes from that email), and no failed top-up
--     since the last card payment (private.workspace_auto_top_up_covers, shared with the
--     low-balance email sweep and balance spend rules).
--   * The forecast for the push text, credits charged over the last seven days
--     (get_workspace_recent_credit_spend), is worked out only for a drop that is pushed.
--   * State lives in workspace_low_balance_push_state, written only when it changes, so an idle
--     sweep writes nothing.
-- Sweeps run one at a time; a call that finds another in progress returns at once.
declare
  v_default_threshold constant bigint := 5000000000;
  v_result jsonb;
begin
  if p_now is null then
    raise exception 'invalid_low_balance_sweep_time';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('sweep_low_balance_pushes', 0)) then
    return jsonb_build_object('skipped', true, 'watched', 0, 'firstSeen', 0, 'dropped', 0, 'rearmed', 0, 'coveredByTopUp', 0, 'alerted', 0);
  end if;

  with watched as (
    select distinct m.workspace_id
    from public.mobile_notification_preferences p
    join public.workspace_members m on m.user_id = p.user_id and m.role in ('owner', 'admin')
    where p.enabled
      and (p.categories -> 'money') is distinct from 'false'::jsonb
      and exists (select 1 from public.mobile_push_devices d where d.user_id = p.user_id and d.status = 'active')
  ),
  observed as (
    select
      w.workspace_id,
      w.balance_nanos,
      case when s.low_balance_email_threshold_nanos > 0 then s.low_balance_email_threshold_nanos else v_default_threshold end as threshold_nanos,
      coalesce(s.low_balance_email_threshold_nanos > 0, false) as own_threshold,
      private.workspace_auto_top_up_covers(w.workspace_id) as top_up_covers,
      st.workspace_id is not null as seen
    from watched x
    join public.wallets w on w.workspace_id = x.workspace_id
    left join public.workspace_settings s on s.workspace_id = x.workspace_id
    left join public.workspace_low_balance_push_state st on st.workspace_id = x.workspace_id
  ),
  first_seen as (
    insert into public.workspace_low_balance_push_state (workspace_id, armed, balance_nanos, threshold_nanos, changed_at, created_at)
    select o.workspace_id, o.balance_nanos > o.threshold_nanos, o.balance_nanos, o.threshold_nanos, p_now, p_now
    from observed o
    where not o.seen
    on conflict (workspace_id) do nothing
    returning workspace_id
  ),
  changed as (
    -- Only rows whose state flips: armed and now at or below the threshold, or unarmed and above.
    update public.workspace_low_balance_push_state st
    set armed = not st.armed,
        balance_nanos = o.balance_nanos,
        threshold_nanos = o.threshold_nanos,
        changed_at = p_now,
        last_alert_at = case when st.armed and not o.top_up_covers then p_now else st.last_alert_at end
    from observed o
    where o.seen
      and st.workspace_id = o.workspace_id
      and st.armed = (o.balance_nanos <= o.threshold_nanos)
    returning st.workspace_id, st.armed, o.balance_nanos, o.threshold_nanos, o.own_threshold, o.top_up_covers
  ),
  alerted as (
    insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
    select
      c.workspace_id,
      'low_balance',
      'money',
      'low_balance:' || c.workspace_id || ':' || to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      jsonb_build_object(
        'balance_nanos', c.balance_nanos,
        'threshold_nanos', c.threshold_nanos,
        'threshold_source', case when c.own_threshold then 'workspace' else 'default' end,
        'recent_spend_nanos', public.get_workspace_recent_credit_spend(c.workspace_id, p_now - interval '7 days'),
        'spend_window_days', 7
      ),
      p_now
    from changed c
    where not c.armed and not c.top_up_covers
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select jsonb_build_object(
    'watched', (select count(*) from observed),
    'firstSeen', (select count(*) from first_seen),
    'dropped', (select count(*) from changed c where not c.armed),
    'rearmed', (select count(*) from changed c where c.armed),
    'coveredByTopUp', (select count(*) from changed c where not c.armed and c.top_up_covers),
    'alerted', (select count(*) from alerted)
  ) into v_result;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_pushes"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.sweep_low_balance_emails (
  p_now       timestamp with time zone DEFAULT now(),
  p_mark_sent boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The low-balance email, off the request path. The API scheduled job runs it every five minutes.
-- It replaces the check the gateway used to make after every charged request, with the same
-- threshold and message, and the armed/unarmed rules of sweep_low_balance_pushes:
--   * Watched: workspaces with low_balance_email_enabled (workspace_settings_low_balance_email_idx)
--     and a wallet. The wallet balance (balance_nanos, as before) is compared with
--     low_balance_email_threshold_nanos; a $0 threshold alerts once the balance reaches $0.
--   * A workspace is armed while its balance is above the threshold. Found armed at or below it,
--     that is a drop: one low_balance email to the owner, and it stays unarmed until a sweep finds
--     the balance back above the threshold (a top-up or credit).
--   * Cooldown: at most one email every six hours, read from
--     workspace_settings.low_balance_email_last_sent_at, which this sweep keeps writing (so the old
--     request-path check and this sweep honour each other's sends during a rollout or rollback).
--     A drop inside the cooldown stays armed and is emailed once the cooldown ends, if the balance
--     is still low. As before, a send whose recorded balance is above today's threshold (the
--     threshold was lowered) does not hold the cooldown.
--   * While auto top-up is on and working (private.workspace_auto_top_up_covers, as for the push),
--     a drop is recorded without an email: the wallet refills, and a failed top-up has its own email.
--   * First seen at or below the threshold, a workspace is armed only if it has credit and was
--     never emailed, which is when the request-path check would still have emailed it on its next
--     charge; otherwise it starts unarmed, so switching to the sweep sends no burst of repeats.
--   * Each email is an email_outbox row of kind and template low_balance with the payload the
--     request path wrote (user_first_name, workspace_id, team_name, balance_nanos, balance_usd,
--     threshold_nanos, threshold_usd), deduped by low_balance_email:<workspace>:<sweep time>.
--     With p_mark_sent (Resend automations on) the row is written as sent, and the job sends the
--     Resend event for each email returned; otherwise the email outbox drain sends it.
--   * State lives in workspace_low_balance_email_state, written only when armed changes or a
--     workspace is first seen, so an idle sweep writes nothing.
-- Sweeps run one at a time; a call that finds another in progress returns at once. Returns the
-- counts and "emails": what was queued, for the Resend events.
declare
  v_cooldown constant interval := interval '6 hours';
  v_result jsonb;
begin
  if p_now is null then
    raise exception 'invalid_low_balance_email_sweep_time';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('sweep_low_balance_emails', 0)) then
    return jsonb_build_object('skipped', true, 'watched', 0, 'firstSeen', 0, 'dropped', 0, 'rearmed', 0, 'coveredByTopUp', 0,
      'waiting', 0, 'emailed', 0, 'emails', '[]'::jsonb);
  end if;

  with observed as (
    select
      s.workspace_id,
      w.balance_nanos,
      s.low_balance_email_threshold_nanos as threshold_nanos,
      w.balance_nanos <= s.low_balance_email_threshold_nanos as low,
      st.workspace_id is not null as seen,
      coalesce(st.armed,
        w.balance_nanos > s.low_balance_email_threshold_nanos
          or (w.balance_nanos > 0 and s.low_balance_email_last_sent_at is null)) as armed,
      s.low_balance_email_last_sent_at > p_now - v_cooldown
        and not coalesce(s.low_balance_email_last_sent_balance_nanos > s.low_balance_email_threshold_nanos, false) as cooling
    -- workspace_settings_low_balance_email_idx
    from public.workspace_settings s
    join public.wallets w on w.workspace_id = s.workspace_id
    left join public.workspace_low_balance_email_state st on st.workspace_id = s.workspace_id
    where s.low_balance_email_enabled
      and s.low_balance_email_threshold_nanos >= 0
  ),
  decided as (
    -- alert: a drop to email; covered: a drop auto top-up handles; waiting: a drop inside the
    -- cooldown (stays armed); rearm: back above; idle: nothing changed.
    select observed.*,
      case
        when observed.armed and observed.low and observed.cooling then 'waiting'
        when observed.armed and observed.low and private.workspace_auto_top_up_covers(observed.workspace_id) then 'covered'
        when observed.armed and observed.low then 'alert'
        when not observed.armed and not observed.low then 'rearm'
        else 'idle'
      end as action
    from observed
  ),
  recipients as (
    select decided.workspace_id, decided.balance_nanos, decided.threshold_nanos, ws.owner_user_id, owner.email,
      coalesce(ws.name, 'your team') as team_name,
      coalesce((regexp_split_to_array(coalesce(
        nullif(btrim(owner.raw_user_meta_data ->> 'first_name'), ''),
        nullif(btrim(owner.raw_user_meta_data ->> 'given_name'), ''),
        nullif(btrim(owner.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(owner.raw_user_meta_data ->> 'name'), '')
      ), '\s+'))[1], 'there') as first_name
    from decided
    join public.workspaces ws on ws.id = decided.workspace_id
    join auth.users owner on owner.id = ws.owner_user_id
    where decided.action = 'alert'
      and nullif(btrim(owner.email), '') is not null
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key, sent_at)
    select
      'low_balance',
      'low_balance',
      r.email,
      'Low balance alert',
      r.workspace_id,
      r.owner_user_id,
      jsonb_build_object(
        'user_first_name', r.first_name,
        'workspace_id', r.workspace_id,
        'team_name', r.team_name,
        'balance_nanos', r.balance_nanos,
        'balance_usd', round(greatest(r.balance_nanos, 0)::numeric / 1000000000, 2),
        'threshold_nanos', r.threshold_nanos,
        'threshold_usd', round(r.threshold_nanos::numeric / 1000000000, 2)
      ),
      'low_balance_email:' || r.workspace_id || ':' || to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      case when p_mark_sent then p_now end
    from recipients r
    on conflict (dedupe_key) do nothing
    returning id, workspace_id, to_email, payload
  ),
  saved as (
    -- First sight, a drop (emailed, covered by auto top-up or without an owner to email) or a
    -- recovery. A drop waiting out the cooldown keeps its state.
    insert into public.workspace_low_balance_email_state as st (workspace_id, armed, balance_nanos, threshold_nanos, changed_at, last_alert_at, created_at)
    select d.workspace_id,
      case d.action when 'alert' then false when 'covered' then false when 'rearm' then true else d.armed end,
      d.balance_nanos, d.threshold_nanos, p_now,
      case when q.workspace_id is not null then p_now end,
      p_now
    from decided d
    left join queued q on q.workspace_id = d.workspace_id
    where d.action in ('alert', 'covered', 'rearm') or not d.seen
    on conflict (workspace_id) do update set
      armed = excluded.armed,
      balance_nanos = excluded.balance_nanos,
      threshold_nanos = excluded.threshold_nanos,
      changed_at = excluded.changed_at,
      last_alert_at = coalesce(excluded.last_alert_at, st.last_alert_at)
    returning st.workspace_id
  ),
  stamped as (
    -- The cooldown the request-path check used, kept so either side respects the other's sends.
    update public.workspace_settings s
    set low_balance_email_last_sent_at = p_now,
        low_balance_email_last_sent_balance_nanos = queued.balance_nanos,
        updated_at = p_now
    from (select q.workspace_id, (q.payload ->> 'balance_nanos')::bigint as balance_nanos from queued q) queued
    where s.workspace_id = queued.workspace_id
    returning 1
  )
  select jsonb_build_object(
    'watched', (select count(*) from observed),
    'firstSeen', (select count(*) from decided where not decided.seen),
    'dropped', (select count(*) from decided where decided.action in ('alert', 'covered')),
    'rearmed', (select count(*) from decided where decided.action = 'rearm' and decided.seen),
    'coveredByTopUp', (select count(*) from decided where decided.action = 'covered'),
    'waiting', (select count(*) from decided where decided.action = 'waiting'),
    'emailed', (select count(*) from queued),
    'stamped', (select count(*) from stamped),
    'saved', (select count(*) from saved),
    'emails', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'workspace_id', q.workspace_id,
        'to_email', q.to_email,
        'user_first_name', q.payload -> 'user_first_name',
        'team_name', q.payload -> 'team_name',
        'balance_nanos', q.payload -> 'balance_nanos',
        'balance_usd', q.payload -> 'balance_usd',
        'threshold_nanos', q.payload -> 'threshold_nanos',
        'threshold_usd', q.payload -> 'threshold_usd'
      ) order by q.workspace_id)
      from queued q
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_low_balance_emails"(timestamp with time zone, boolean) IS 'Queues the low-balance email (kind low_balance) once per drop to or below a workspace''s low_balance_email_threshold_nanos, at most every six hours, never while auto top-up is working; re-arms once the balance is back above. Replaces the request-path check. Called every 5 minutes by the API scheduled job; p_mark_sent writes the rows as sent when Resend automations deliver them.';

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_emails"(timestamp with time zone, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_emails"(timestamp with time zone, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_low_balance_emails"(timestamp with time zone, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_low_balance_emails"(timestamp with time zone, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.spend_rule_evaluable (
  p_metric    text,
  p_period    text,
  p_base_kind text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Which spend rules private.evaluate_workspace_spend_rules handles so far: spend and
  -- budget_percent over a calendar day, week or month, with an amount, workspace budget or key
  -- limit base; and balance rules (workspace scope, rolling: window_hours is the burn-rate
  -- lookback). Forecast, spike, other rolling windows and previous_period bases are added by
  -- later changes, which widen this test so that the sweep's passes and the evaluator stay in step.
  select (p_metric in ('spend', 'budget_percent')
      and p_period in ('day', 'week', 'month')
      and (p_base_kind is null or p_base_kind in ('amount', 'workspace_budget', 'key_limit')))
    or (p_metric in ('balance') and p_period = 'rolling' and p_base_kind is null);
$function$;

COMMENT ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) IS 'True for the spend rules the evaluator handles: spend and budget_percent (amount, workspace_budget or key_limit base) over a calendar day, week or month, and balance rules (rolling burn-rate window).';

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_rule_evaluable"(text, text, text) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_balance_rule_values (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_rule_id      uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id                     uuid,
    name                   text,
    action                 text,
    window_hours           integer,
    threshold_amount_nanos bigint,
    runway_days            integer,
    cooldown_minutes       integer,
    balance_nanos          bigint,
    reserved_nanos         bigint,
    available_nanos        bigint,
    burn_nanos             numeric,
    burn_per_day_nanos     numeric,
    runway_days_left       numeric,
    low_balance            boolean,
    low_runway             boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Where balance spend rules stand at p_now: the one definition the evaluator
  -- (private.evaluate_workspace_spend_rules) and the API preview (public.preview_workspace_spend_rule)
  -- share.
  --   * Without p_rule_id: the workspace's enabled, non-deleted balance rules that
  --     private.spend_rule_evaluable accepts. With p_rule_id: that balance rule if it is not deleted.
  --   * Balance: what the gateway admits requests against, balance_nanos - reserved_nanos (at
  --     least 0). No wallet: no values, so the rule does not fire.
  --   * Burn: spend over the rule's window_hours before p_now, as the other rules count spend
  --     (v2_private_usage_15m plus successful async jobs and realtime sessions from
  --     gateway_requests), scaled to a day. Runway: available / burn per day; none without spend.
  --   * low_balance: available at or below threshold_amount_nanos. low_runway: runway at or below
  --     runway_days.
  with rules as materialized (
    select rule.id, rule.name, rule.action, rule.window_hours, rule.threshold_amount_nanos, rule.runway_days, rule.cooldown_minutes
    from public.workspace_spend_rules rule
    where rule.workspace_id = p_workspace_id
      and rule.deleted_at is null
      and rule.metric = 'balance'
      and rule.window_hours is not null
      and case
        when p_rule_id is null then rule.enabled and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
        else rule.id = p_rule_id
      end
  ),
  wallet as (
    select w.balance_nanos, w.reserved_nanos, greatest(w.balance_nanos - coalesce(w.reserved_nanos, 0), 0) as available_nanos
    from public.wallets w
    where w.workspace_id = p_workspace_id
  ),
  burned as (
    select rules.*, (
        select coalesce(sum(rollup.cost_nanos), 0)
        from public.v2_private_usage_15m rollup
        where rollup.workspace_id = p_workspace_id
          and rollup.bucket_start >= p_now - make_interval(hours => rules.window_hours)
          and rollup.bucket_start < p_now
      ) + (
        -- gateway_requests_async_spend_idx
        select coalesce(sum(request.cost_nanos), 0)
        from public.gateway_requests request
        where request.success is true
          and request.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
          and request.workspace_id = p_workspace_id
          and request.created_at >= p_now - make_interval(hours => rules.window_hours)
          and request.created_at < p_now
      ) as burn_nanos
    from rules
  )
  select burned.id, burned.name, burned.action, burned.window_hours, burned.threshold_amount_nanos, burned.runway_days,
    burned.cooldown_minutes, wallet.balance_nanos, wallet.reserved_nanos, wallet.available_nanos, burned.burn_nanos,
    per_day.burn_per_day_nanos,
    case when per_day.burn_per_day_nanos > 0 then round(wallet.available_nanos / per_day.burn_per_day_nanos, 2) end,
    burned.threshold_amount_nanos is not null and wallet.available_nanos <= burned.threshold_amount_nanos,
    burned.runway_days is not null and per_day.burn_per_day_nanos > 0
      and wallet.available_nanos <= burned.runway_days * per_day.burn_per_day_nanos
  from burned
  cross join wallet
  cross join lateral (select burned.burn_nanos * 24 / burned.window_hours as burn_per_day_nanos) per_day;
$function$;

COMMENT ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) IS 'Available balance (balance - reserved), burn over the rule''s window_hours (rollup plus async jobs), burn per day and runway of balance spend rules at p_now, and whether each is at or below its balance or runway threshold. Shared by the evaluator and the API preview.';

REVOKE ALL ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_rule_values"(uuid, timestamp with time zone, uuid) TO "service_role";

CREATE OR REPLACE FUNCTION private.spend_balance_alert_text (
  p_rule_name              text,
  p_available_nanos        bigint,
  p_threshold_amount_nanos bigint,
  p_runway_days            integer,
  p_burn_per_day_nanos     numeric,
  p_runway_days_left       numeric,
  p_window_hours           integer,
  p_trigger                text
)
  RETURNS TABLE (
    title   text,
    message text
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The text of a balance spend alert, in US money format. p_trigger: 'balance' when the balance
  -- is at or below the rule's amount, else 'runway' (days of credit left at or below runway_days).
  -- Used by private.evaluate_workspace_spend_rules and by public.preview_workspace_spend_rule for
  -- previews and test sends, so both read the same.
  with parts as (
    select
      case
        when p_window_hours % 24 = 0 and p_window_hours > 24 then (p_window_hours / 24) || ' days'
        when p_window_hours = 1 then 'hour'
        else p_window_hours || ' hours'
      end as window_text,
      case
        when p_runway_days_left is null then null
        when p_runway_days_left < 1 then 'less than a day'
        else 'about ' || to_char(p_runway_days_left, 'FM999,999,990.0') || ' days'
      end as runway_text
  )
  select
    left(p_rule_name, 100) || ': ' || case when p_trigger = 'balance'
        then 'balance at or below ' || private.workspace_push_usd(p_threshold_amount_nanos)
        else coalesce(parts.runway_text, 'little') || ' of credit left'
      end,
    'The workspace balance is ' || private.workspace_push_usd(greatest(p_available_nanos, 0))
      || case when p_trigger = 'balance'
        then ', at or below the ' || private.workspace_push_usd(p_threshold_amount_nanos) || ' alert threshold. '
        else '. '
      end
      || case when p_burn_per_day_nanos > 0
        then 'Spend over the last ' || parts.window_text || ' averages ' || private.workspace_push_usd(round(p_burn_per_day_nanos)::bigint)
          || ' a day, so it lasts ' || parts.runway_text
          || case when p_runway_days is not null then ' (alert at ' || p_runway_days || case when p_runway_days = 1 then ' day' else ' days' end || ')' else '' end
          || '. '
        else 'There was no spend in the last ' || parts.window_text || '. '
      end
      || 'Top up credits in Settings > Credits.'
  from parts;
$function$;

COMMENT ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) IS 'Title and message of a balance spend alert (balance at or below an amount, or runway at or below a number of days). Shared by the evaluator and the API preview / test send.';

REVOKE ALL ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_balance_alert_text"(text, bigint, bigint, integer, numeric, numeric, integer, text) TO "service_role";

CREATE OR REPLACE FUNCTION private.evaluate_workspace_spend_rules (
  p_workspace_id uuid,
  p_now          timestamp with time zone,
  p_blocks       boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates a workspace's enabled spend rules at p_now, queues an alert for each rule that
-- crossed a threshold, and starts or lifts the blocks of rules with action = 'block'.
--   * Rules: private.spend_rule_evaluable (spend and budget_percent over a calendar day, Monday
--     week or month, and balance rules); other metrics are left for later. Each calendar rule's
--     period is in its own time zone, or the workspace's billing_time_zone (private.spend_rule_period).
--   * Spend: v2_private_usage_15m from the period start up to p_now, plus successful async jobs
--     and realtime sessions from gateway_requests (as sweep_spend_limit_warnings adds them).
--     The rollup is read as it stands: hours the outbox has yet to rebuild count once it marks
--     the workspace dirty again. Values come from private.spend_rule_values and the text from
--     private.spend_rule_alert_text, which the API preview and test sends share.
--   * Scopes: workspace; key (key_id); member (actor_user_id: their keys and OAuth requests);
--     department (private.spend_scope_departments, read now, so moving someone moves their
--     spend for the current period); model (model_id); provider (the route's provider_slug,
--     or gateway_requests.provider for async jobs).
--   * Bases for budget_percent: amount (base_amount_nanos), workspace_budget (the
--     workspace_budgets row for base_ref) and key_limit (the key's *_limit_cost_nanos). A rule
--     whose budget or limit is missing or 0 does not fire.
--   * Firing: each threshold at most once per period. Several crossed at once make one event
--     naming the highest. A spend rule fires once per period at threshold_amount_nanos.
--   * Each event is an email_outbox row of kind spend_alert, deduped by
--     spend_alert:<rule id>:<period start, UTC ISO>:<threshold percent, or amount-<nanos>>, with
--     its text in payload.title / payload.message and a payload.push for the mobile app. The
--     routed delivery job sends it to the rule's destinations, or else the workspace's
--     spend_alert routes; mobile push picks it up as a money push.
--   * workspace_spend_rule_state is written only when a rule fires, or for the first evaluation
--     in a period (the rollover row), never on a quiet re-evaluation.
--   * Blocks (grace margin): a block rule's block point is block_at_amount_nanos (spend rules) or
--     block_at_percent of the base (budget_percent rules). Once spend this period reaches it, a
--     workspace_spend_blocks row starts, unless the rule already has an active block or an
--     admin lifted one manually this period (a manual lift holds until the period resets).
--     Blocks start only when p_blocks is true (SPEND_RULE_BLOCKS_ENABLED) and p_now is within
--     15 minutes of the database clock, so a late or replayed evaluation never starts one; a
--     failed evaluation rolls back. Active blocks are lifted, whatever p_blocks says, when the
--     period resets (period_reset), spend is below the block point again, for example because
--     the budget was raised (below_limit, or rule_changed when the rule was edited since the
--     block started), or the rule was deleted, disabled or no longer blocks (rule_deleted,
--     rule_disabled, rule_changed; the rule-change trigger usually lifts these first). An active
--     block whose rule stopped or started covering free models takes the rule's setting.
--     Each start and lift queues a spend_blocked event (private.queue_spend_block_event).
--   * Balance rules (workspace scope, rolling): values from private.spend_balance_rule_values
--     (available balance = balance - reserved, as the gateway admits requests; burn over
--     window_hours from the rollup plus async jobs; runway = available / burn per day). A rule is
--     low when the balance is at or below threshold_amount_nanos or the runway at or below
--     runway_days. Armed/unarmed, as the low-balance push and email: one state row
--     (period_start '-infinity'), armed until a drop. Found armed and low, that is a drop: one
--     alert, unless the last one was within cooldown_minutes (then it stays armed and fires once
--     the cooldown ends, if still low) or auto top-up is working
--     (private.workspace_auto_top_up_covers; the drop is recorded unarmed without an alert). It
--     re-arms once neither threshold holds. Dedupe:
--     spend_alert:<rule id>:cooldown:<epoch / cooldown>:<balance|runway>. The state row is written
--     only when armed changes or the rule fires.
-- Returns {rules, fired, state_rows, events: [{event_id, rule_id, dedupe_key, threshold}],
-- blocks: [{block_id, rule_id, state: started|lifted, reason, event_id}], block_scope}, where
-- block_scope says the workspace has block rules or blocks, so its gateway entry is republished.
declare
  v_workspace record;
  v_result jsonb;
  v_block_rules jsonb;
  v_block record;
  v_blocks jsonb := '[]'::jsonb;
  v_changed integer := 0;
  v_fresh boolean;
  v_balance jsonb;
begin
  if p_workspace_id is null or p_now is null then
    raise exception 'invalid_spend_rule_evaluation';
  end if;

  select w.id, w.name, w.owner_user_id, coalesce(settings.billing_time_zone, 'UTC') as time_zone, owner.email as owner_email
    into v_workspace
  from public.workspaces w
  left join public.workspace_settings settings on settings.workspace_id = w.id
  left join auth.users owner on owner.id = w.owner_user_id
  where w.id = p_workspace_id;
  if not found then
    return jsonb_build_object('rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb,
      'block_scope', false, 'missing', true);
  end if;

  with valued as materialized (
    -- Spend so far and the base of every enabled, evaluable rule (shared with the API preview).
    select * from private.spend_rule_values(p_workspace_id, p_now)
  ),
  decided as (
    select valued.*, state.rule_id is not null as has_state, state.highest_percent_fired, state.amount_fired_at,
      crossed.highest as crossed_percent
    from valued
    left join public.workspace_spend_rule_state state
      on state.rule_id = valued.id and state.period_start = valued.period_start
    cross join lateral (
      select max(threshold) as highest
      from unnest(valued.threshold_percents) threshold
      where valued.metric = 'budget_percent'
        and valued.base_nanos > 0
        and valued.value_nanos * 100 >= threshold::numeric * valued.base_nanos
    ) crossed
  ),
  firing as (
    select decided.*,
      case when decided.metric = 'spend' then 'amount-' || decided.threshold_amount_nanos else decided.crossed_percent::text end as threshold_key,
      to_char(decided.period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as period_key
    from decided
    where (decided.metric = 'spend' and decided.amount_fired_at is null and decided.value_nanos >= decided.threshold_amount_nanos)
      or (decided.metric = 'budget_percent' and decided.crossed_percent > coalesce(decided.highest_percent_fired, 0))
  ),
  rendered as (
    select firing.*, alert.scope_label, alert.title, alert.message,
      'spend_alert:' || firing.id || ':' || firing.period_key || ':' || firing.threshold_key as dedupe_key
    from firing
    cross join lateral private.spend_rule_alert_text(
      v_workspace.name, firing.name, firing.metric, firing.scope_type, firing.scope_id, firing.scope_key_id,
      firing.scope_user_id, firing.scope_department_id, firing.period, firing.period_end, firing.time_zone,
      firing.base_kind, firing.base_ref, firing.base_nanos, firing.threshold_percents, firing.threshold_amount_nanos,
      firing.value_nanos, firing.crossed_percent
    ) alert
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    select
      'spend_alert',
      'spend_alert',
      coalesce(v_workspace.owner_email, ''),
      rendered.title,
      p_workspace_id,
      v_workspace.owner_user_id,
      jsonb_build_object(
        'title', rendered.title,
        'message', rendered.message,
        'workspace_name', v_workspace.name,
        'rule_id', rendered.id,
        'rule_name', rendered.name,
        'metric', rendered.metric,
        'action', rendered.action,
        'scope', jsonb_strip_nulls(jsonb_build_object(
          'type', rendered.scope_type,
          'id', rendered.scope_id,
          'label', rendered.scope_label,
          'key_id', rendered.scope_key_id,
          'user_id', rendered.scope_user_id,
          'department_id', rendered.scope_department_id
        )),
        'period', jsonb_build_object(
          'kind', rendered.period,
          'start', rendered.period_start,
          'end', rendered.period_end,
          'time_zone', rendered.time_zone
        ),
        'value_nanos', rendered.value_nanos,
        'base_kind', rendered.base_kind,
        'base_ref', rendered.base_ref,
        'base_nanos', rendered.base_nanos,
        'percent', case when rendered.base_nanos > 0 then round(rendered.value_nanos * 100 / rendered.base_nanos, 1) end,
        'threshold_percent', rendered.crossed_percent,
        'threshold_percents', to_jsonb(rendered.threshold_percents),
        'thresholds_crossed', case when rendered.metric = 'budget_percent' then (
          select coalesce(jsonb_agg(threshold order by threshold), '[]'::jsonb)
          from unnest(rendered.threshold_percents) threshold
          where threshold <= rendered.crossed_percent and threshold > coalesce(rendered.highest_percent_fired, 0)
        ) end,
        'threshold_amount_nanos', rendered.threshold_amount_nanos,
        'evaluated_at', p_now,
        'url', 'https://phaseo.app/settings/notifications',
        'push', jsonb_build_object(
          'title', left(rendered.title, 120),
          'body', left(rendered.message, 240),
          'href', '/settings/notifications',
          'lowerLead', false
        )
      ),
      rendered.dedupe_key
    from rendered
    on conflict (dedupe_key) do nothing
    returning id, dedupe_key, payload
  ),
  saved as (
    -- A fired rule records what it sent; a rule seen for the first time this period gets its
    -- rollover row. Rules already recorded this period that fire nothing are not written.
    insert into public.workspace_spend_rule_state as state (
      rule_id, workspace_id, period_start, period_end, highest_percent_fired, amount_fired_at, last_fired_at,
      fire_count, last_value_nanos, last_base_nanos, last_dedupe_key
    )
    select
      decided.id, p_workspace_id, decided.period_start, decided.period_end,
      case when rendered.id is not null then rendered.crossed_percent end,
      case when rendered.id is not null and decided.metric = 'spend' then p_now end,
      case when rendered.id is not null then p_now end,
      case when rendered.id is not null then 1 else 0 end,
      case when rendered.id is not null then round(decided.value_nanos)::bigint end,
      case when rendered.id is not null then decided.base_nanos end,
      rendered.dedupe_key
    from decided
    left join rendered on rendered.id = decided.id
    where rendered.id is not null or not decided.has_state
    on conflict (rule_id, period_start) do update set
      highest_percent_fired = greatest(state.highest_percent_fired, excluded.highest_percent_fired),
      amount_fired_at = coalesce(state.amount_fired_at, excluded.amount_fired_at),
      last_fired_at = coalesce(excluded.last_fired_at, state.last_fired_at),
      fire_count = state.fire_count + excluded.fire_count,
      last_value_nanos = coalesce(excluded.last_value_nanos, state.last_value_nanos),
      last_base_nanos = coalesce(excluded.last_base_nanos, state.last_base_nanos),
      last_dedupe_key = coalesce(excluded.last_dedupe_key, state.last_dedupe_key)
    returning 1
  )
  select jsonb_build_object(
    'rules', (select count(*) from valued),
    'fired', (select count(*) from queued),
    'state_rows', (select count(*) from saved),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', queued.id,
        'rule_id', queued.payload ->> 'rule_id',
        'dedupe_key', queued.dedupe_key,
        'threshold', coalesce(queued.payload -> 'threshold_percent', queued.payload -> 'threshold_amount_nanos')
      ) order by queued.dedupe_key)
      from queued
    ), '[]'::jsonb),
    -- The block point and spend of each block rule, for the block statements below.
    'block_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rule_id', valued.id,
        'period_start', valued.period_start,
        'period_end', valued.period_end,
        'value_nanos', valued.value_nanos,
        'limit_nanos', case valued.metric
          when 'spend' then rule.block_at_amount_nanos
          when 'budget_percent' then case when valued.base_nanos > 0
            then ceil(rule.block_at_percent::numeric * valued.base_nanos / 100)::bigint end
        end,
        'scope_type', valued.scope_type,
        'scope_id', valued.scope_id,
        'block_free_models', rule.block_free_models
      ))
      from valued
      join public.workspace_spend_rules rule on rule.id = valued.id
      where valued.action = 'block'
    ), '[]'::jsonb)
  ) into v_result;

  -- Balance rules: armed until the balance (or runway) drops to the threshold, then one alert.
  with balance as materialized (
    select * from private.spend_balance_rule_values(p_workspace_id, p_now)
  ),
  decided as (
    select balance.*, coalesce(state.armed, true) as armed,
      balance.low_balance or balance.low_runway as low,
      state.last_fired_at is not null and state.last_fired_at > p_now - make_interval(mins => balance.cooldown_minutes) as cooling,
      case when balance.low_balance then 'balance' else 'runway' end as trigger
    from balance
    left join public.workspace_spend_rule_state state
      on state.rule_id = balance.id and state.period_start = '-infinity'::timestamptz
  ),
  acted as materialized (
    select decided.*,
      case
        when decided.armed and decided.low and decided.cooling then 'waiting'
        when decided.armed and decided.low and private.workspace_auto_top_up_covers(p_workspace_id) then 'covered'
        when decided.armed and decided.low then 'fire'
        when not decided.armed and not decided.low then 'rearm'
        else 'idle'
      end as outcome
    from decided
  ),
  rendered as (
    select acted.*, alert.title, alert.message,
      'spend_alert:' || acted.id || ':cooldown:' || floor(extract(epoch from p_now) / (acted.cooldown_minutes * 60))::bigint
        || ':' || acted.trigger as dedupe_key
    from acted
    cross join lateral private.spend_balance_alert_text(
      acted.name, acted.available_nanos, acted.threshold_amount_nanos, acted.runway_days, acted.burn_per_day_nanos,
      acted.runway_days_left, acted.window_hours, acted.trigger
    ) alert
    where acted.outcome = 'fire'
  ),
  queued as (
    insert into public.email_outbox (kind, template, to_email, subject, workspace_id, user_id, payload, dedupe_key)
    select
      'spend_alert',
      'spend_alert',
      coalesce(v_workspace.owner_email, ''),
      rendered.title,
      p_workspace_id,
      v_workspace.owner_user_id,
      jsonb_build_object(
        'title', rendered.title,
        'message', rendered.message,
        'workspace_name', v_workspace.name,
        'rule_id', rendered.id,
        'rule_name', rendered.name,
        'metric', 'balance',
        'action', rendered.action,
        'scope', jsonb_build_object('type', 'workspace', 'label', coalesce(nullif(btrim(v_workspace.name), ''), 'Workspace')),
        'period', jsonb_build_object(
          'kind', 'rolling',
          'start', p_now - make_interval(hours => rendered.window_hours),
          'end', p_now,
          'time_zone', v_workspace.time_zone,
          'window_hours', rendered.window_hours
        ),
        'trigger', rendered.trigger,
        'value_nanos', rendered.available_nanos,
        'balance_nanos', rendered.balance_nanos,
        'reserved_nanos', rendered.reserved_nanos,
        'available_nanos', rendered.available_nanos,
        'burn_nanos', round(rendered.burn_nanos),
        'burn_per_day_nanos', round(rendered.burn_per_day_nanos),
        'runway_days_left', rendered.runway_days_left,
        'runway_days', rendered.runway_days,
        'threshold_amount_nanos', rendered.threshold_amount_nanos,
        'evaluated_at', p_now,
        'url', 'https://phaseo.app/settings/credits',
        'push', jsonb_build_object(
          'title', left(rendered.title, 120),
          'body', left(rendered.message, 240),
          'href', '/settings/credits',
          'lowerLead', false
        )
      ),
      rendered.dedupe_key
    from rendered
    on conflict (dedupe_key) do nothing
    returning id, dedupe_key, payload
  ),
  saved as (
    -- A drop (fired or covered by auto top-up) clears armed, a recovery sets it. A waiting or
    -- unchanged rule is not written.
    insert into public.workspace_spend_rule_state as state (
      rule_id, workspace_id, period_start, period_end, armed, amount_fired_at, last_fired_at, fire_count, last_value_nanos, last_dedupe_key
    )
    select acted.id, p_workspace_id, '-infinity'::timestamptz, null, acted.outcome = 'rearm',
      case when rendered.id is not null and acted.trigger = 'balance' then p_now end,
      case when rendered.id is not null then p_now end,
      case when rendered.id is not null then 1 else 0 end,
      case when rendered.id is not null then acted.available_nanos end,
      rendered.dedupe_key
    from acted
    left join rendered on rendered.id = acted.id
    where acted.outcome in ('fire', 'covered', 'rearm')
    on conflict (rule_id, period_start) do update set
      armed = excluded.armed,
      amount_fired_at = coalesce(excluded.amount_fired_at, state.amount_fired_at),
      last_fired_at = coalesce(excluded.last_fired_at, state.last_fired_at),
      fire_count = state.fire_count + excluded.fire_count,
      last_value_nanos = coalesce(excluded.last_value_nanos, state.last_value_nanos),
      last_dedupe_key = coalesce(excluded.last_dedupe_key, state.last_dedupe_key)
    returning 1
  )
  select jsonb_build_object(
    'rules', (select count(*) from balance),
    'fired', (select count(*) from queued),
    'state_rows', (select count(*) from saved),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', queued.id,
        'rule_id', queued.payload ->> 'rule_id',
        'dedupe_key', queued.dedupe_key,
        'threshold', case queued.payload ->> 'trigger'
          when 'balance' then queued.payload -> 'threshold_amount_nanos'
          else queued.payload -> 'runway_days'
        end,
        'trigger', queued.payload ->> 'trigger'
      ) order by queued.dedupe_key)
      from queued
    ), '[]'::jsonb)
  ) into v_balance;

  v_result := v_result || jsonb_build_object(
    'rules', (v_result ->> 'rules')::integer + (v_balance ->> 'rules')::integer,
    'fired', (v_result ->> 'fired')::integer + (v_balance ->> 'fired')::integer,
    'state_rows', (v_result ->> 'state_rows')::integer + (v_balance ->> 'state_rows')::integer,
    'events', (v_result -> 'events') || (v_balance -> 'events')
  );

  v_block_rules := v_result -> 'block_rules';
  v_result := v_result - 'block_rules';

  -- Lift active blocks that no longer apply. Lifts come before starts: a rule's new block cannot
  -- start while its old one is still active (one active block per rule).
  for v_block in
    with block_rule as (
      select * from jsonb_to_recordset(v_block_rules) as x(
        rule_id uuid, period_start timestamptz, period_end timestamptz, value_nanos numeric, limit_nanos bigint,
        scope_type text, scope_id text, block_free_models boolean)
    ),
    decided as (
      select block.id, case
          when block.rule_id is null or rule.id is null or rule.deleted_at is not null then 'rule_deleted'
          when not rule.enabled then 'rule_disabled'
          when rule.action <> 'block' or block_rule.rule_id is null then 'rule_changed'
          when block.period_start <> block_rule.period_start then
            case when block.resets_at is not null and block.resets_at <= p_now then 'period_reset' else 'rule_changed' end
          when block.scope_type <> block_rule.scope_type or block.scope_id is distinct from block_rule.scope_id then 'rule_changed'
          when block_rule.limit_nanos is null or block_rule.value_nanos < block_rule.limit_nanos then
            case when rule.updated_at > block.started_at then 'rule_changed' else 'below_limit' end
        end as reason
      from public.workspace_spend_blocks block
      left join public.workspace_spend_rules rule on rule.id = block.rule_id
      left join block_rule on block_rule.rule_id = block.rule_id
      where block.workspace_id = p_workspace_id
        and block.lifted_at is null
    )
    update public.workspace_spend_blocks block
    set lifted_at = greatest(p_now, block.started_at), lift_reason = decided.reason
    from decided
    where block.id = decided.id
      and decided.reason is not null
    returning block.id, block.rule_id, block.lift_reason
  loop
    v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
      'block_id', v_block.id, 'rule_id', v_block.rule_id, 'state', 'lifted', 'reason', v_block.lift_reason,
      'event_id', private.queue_spend_block_event(v_block.id, 'lifted', p_now)));
  end loop;

  -- An active block follows its rule's free-model setting.
  with block_rule as (
    select * from jsonb_to_recordset(v_block_rules) as x(rule_id uuid, block_free_models boolean)
  )
  update public.workspace_spend_blocks block
  set block_free_models = block_rule.block_free_models
  from block_rule
  where block.rule_id = block_rule.rule_id
    and block.workspace_id = p_workspace_id
    and block.lifted_at is null
    and block.block_free_models <> block_rule.block_free_models;
  get diagnostics v_changed = row_count;

  -- Start blocks: only on a current evaluation, never for a rule lifted by hand this period.
  v_fresh := p_blocks and p_now between now() - interval '15 minutes' and now() + interval '5 minutes';
  if v_fresh then
    for v_block in
      insert into public.workspace_spend_blocks as block (
        workspace_id, rule_id, scope_type, scope_id, block_free_models, period_start, resets_at, spend_nanos, limit_nanos, started_at
      )
      select p_workspace_id, block_rule.rule_id, block_rule.scope_type, block_rule.scope_id, block_rule.block_free_models,
        block_rule.period_start, block_rule.period_end, round(block_rule.value_nanos)::bigint, block_rule.limit_nanos, p_now
      from jsonb_to_recordset(v_block_rules) as block_rule(
        rule_id uuid, period_start timestamptz, period_end timestamptz, value_nanos numeric, limit_nanos bigint,
        scope_type text, scope_id text, block_free_models boolean)
      where block_rule.limit_nanos > 0
        and block_rule.value_nanos >= block_rule.limit_nanos
        and p_now < block_rule.period_end
        and not exists (
          select 1 from public.workspace_spend_blocks active
          where active.rule_id = block_rule.rule_id and active.lifted_at is null
        )
        and not exists (
          select 1 from public.workspace_spend_blocks lifted
          where lifted.rule_id = block_rule.rule_id
            and lifted.period_start = block_rule.period_start
            and lifted.lift_reason = 'manual'
        )
      on conflict do nothing
      returning block.id, block.rule_id
    loop
      v_blocks := v_blocks || jsonb_build_array(jsonb_build_object(
        'block_id', v_block.id, 'rule_id', v_block.rule_id, 'state', 'started', 'reason', null,
        'event_id', private.queue_spend_block_event(v_block.id, 'started', p_now)));
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'blocks', v_blocks,
    'block_scope', jsonb_array_length(v_block_rules) > 0 or jsonb_array_length(v_blocks) > 0 or v_changed > 0
      or exists (select 1 from public.workspace_spend_blocks block where block.workspace_id = p_workspace_id and block.lifted_at is null)
  );
end;
$function$;

COMMENT ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) IS 'Evaluates a workspace''s enabled spend and budget_percent rules over their calendar period at p_now: queues one spend_alert event per rule that crossed a new threshold (the highest one) and per balance rule whose balance or runway dropped to its threshold (armed/unarmed with a cooldown, never while auto top-up is working), lifts blocks that no longer apply and, when p_blocks is true and p_now is current, starts blocks for block rules past their block point. Writes rule state only on fire or period rollover. Called by public.sweep_spend_rules.';

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."evaluate_workspace_spend_rules"(uuid, timestamp with time zone, boolean) TO "service_role";

CREATE OR REPLACE FUNCTION public.sweep_spend_rules (
  p_now   timestamp with time zone DEFAULT now(),
  p_limit  integer                  DEFAULT 100,
  p_blocks boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Evaluates spend rules (private.evaluate_workspace_spend_rules) for four sets of workspaces,
-- each up to p_limit, every workspace at most once per call:
--   1. dirty:    workspace_spend_rule_dirty rows, which process_v2_analytics_outbox writes when
--                it rebuilds a workspace's usage. They are claimed with SKIP LOCKED and deleted
--                as they are claimed, oldest first; a workspace marked again while this runs is
--                kept for the next call.
--   2. rollover: workspaces with an enabled rule that has no state row for its current period,
--                so a new day, week or month (in the rule's time zone) or a new rule is picked up
--                within one call, with or without traffic, and workspaces with an active block
--                past its reset, so the block lifts on time.
--   3. periodic: one twelfth of the workspaces with enabled rules, by a hash of the workspace id
--                and the 5-minute slot of p_now, so each is evaluated about once an hour when
--                called every 5 minutes. This catches changes no usage marks: a budget or key
--                limit lowered, a rule edited, rollup hours rebuilt late. A slot over p_limit
--                rotates hourly, so none of its workspaces is skipped for good.
--   4. balance:  workspaces with balance rules, in one of three slices by the same hash (each
--                every 15 minutes): a balance falls or recovers without new usage (reservations,
--                refunds, top-ups, credits), so balance rules cannot wait for the dirty mark.
-- Workspaces that no longer exist are skipped. One sweep runs at a time; a concurrent call
-- returns skipped_locked. p_blocks (SPEND_RULE_BLOCKS_ENABLED) lets block rules start blocks;
-- blocks are lifted either way. Returns the counts, the events queued, the block changes
-- ("blocks": [{workspace_id, block_id, rule_id, state, reason, event_id}]) and "publish": the
-- evaluated workspaces with block rules or blocks, whose gateway entry the job republishes.
declare
  v_slots constant integer := 12;
  v_slot integer;
  v_round bigint;
  v_dirty uuid[];
  v_rollover uuid[];
  v_periodic uuid[];
  v_balance_slots constant integer := 3;
  v_balance_round bigint;
  v_balance uuid[];
  v_workspace uuid;
  v_result jsonb;
  v_events jsonb := '[]'::jsonb;
  v_blocks jsonb := '[]'::jsonb;
  v_publish uuid[] := '{}';
  v_evaluated integer := 0;
  v_rules integer := 0;
  v_fired integer := 0;
  v_state_rows integer := 0;
begin
  if p_now is null then
    raise exception 'invalid_spend_rule_sweep_time';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_spend_rule_sweep_limit';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('public.sweep_spend_rules', 0)) then
    return jsonb_build_object('skipped_locked', true, 'dirty', 0, 'rollover', 0, 'periodic', 0, 'balance', 0, 'evaluated', 0,
      'rules', 0, 'fired', 0, 'state_rows', 0, 'events', '[]'::jsonb, 'blocks', '[]'::jsonb, 'publish', '[]'::jsonb);
  end if;

  with claimed as (
    delete from public.workspace_spend_rule_dirty dirty
    where dirty.workspace_id in (
      select candidate.workspace_id
      from public.workspace_spend_rule_dirty candidate
      order by candidate.dirtied_at, candidate.workspace_id
      limit p_limit
      for update skip locked
    )
    returning dirty.workspace_id
  )
  select coalesce(array_agg(claimed.workspace_id), '{}') into v_dirty from claimed;

  select coalesce(array_agg(due.workspace_id), '{}') into v_rollover
  from (
    select rule.workspace_id
    from public.workspace_spend_rules rule
    left join public.workspace_settings settings on settings.workspace_id = rule.workspace_id
    cross join lateral private.spend_rule_period(rule.period, coalesce(rule.time_zone, settings.billing_time_zone, 'UTC'), p_now) period
    where rule.enabled
      and rule.deleted_at is null
      and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
      and rule.workspace_id <> all (v_dirty)
      and not exists (
        select 1 from public.workspace_spend_rule_state state
        where state.rule_id = rule.id and state.period_start = period.period_start
      )
    union
    -- workspace_spend_blocks_workspace_active_idx
    select block.workspace_id
    from public.workspace_spend_blocks block
    where block.lifted_at is null
      and block.resets_at <= p_now
      and block.workspace_id <> all (v_dirty)
    order by 1
    limit p_limit
  ) due;

  v_slot := (floor(extract(epoch from p_now) / 300)::bigint % v_slots)::integer;
  -- A slot with more than p_limit workspaces starts p_limit further along each hour, so every
  -- workspace in it is reached within ceil(n / p_limit) hours instead of only the first p_limit.
  v_round := floor(extract(epoch from p_now) / 3600)::bigint;
  select coalesce(array_agg(due.workspace_id), '{}') into v_periodic
  from (
    select slot.workspace_id
    from (
      select candidate.workspace_id,
        pg_catalog.row_number() over (order by candidate.workspace_id) - 1 as position,
        pg_catalog.count(*) over () as total
      from (
        select distinct rule.workspace_id
        from public.workspace_spend_rules rule
        where rule.enabled
          and rule.deleted_at is null
          and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_slots + v_slots) % v_slots = v_slot
          and rule.workspace_id <> all (v_dirty)
          and rule.workspace_id <> all (v_rollover)
      ) candidate
    ) slot
    where ((slot.position - v_round * p_limit) % slot.total + slot.total) % slot.total < p_limit
  ) due;

  -- Balance rules: a balance moves without usage (reservations, refunds, top-ups, credits), so
  -- workspaces with balance rules are also taken in one of three slices by the same hash, that
  -- is every 15 minutes when called every 5 minutes. Like the periodic slot, a slice with more
  -- than p_limit workspaces starts p_limit further along on each visit. Positions are taken over
  -- the whole slice and workspaces another set already evaluates are dropped afterwards, so the
  -- window does not shift with them and every workspace is reached within ceil(n / p_limit) visits.
  v_balance_round := floor(extract(epoch from p_now) / 900)::bigint;
  select coalesce(array_agg(due.workspace_id), '{}') into v_balance
  from (
    select slice.workspace_id
    from (
      select candidate.workspace_id,
        pg_catalog.row_number() over (order by candidate.workspace_id) - 1 as position,
        pg_catalog.count(*) over () as total
      from (
        select distinct rule.workspace_id
        from public.workspace_spend_rules rule
        where rule.metric = 'balance'
          and rule.enabled
          and rule.deleted_at is null
          and private.spend_rule_evaluable(rule.metric, rule.period, rule.base_kind)
          and (pg_catalog.hashtextextended(rule.workspace_id::text, 0) % v_balance_slots + v_balance_slots) % v_balance_slots
            = v_slot % v_balance_slots
      ) candidate
    ) slice
    where ((slice.position - v_balance_round * p_limit) % slice.total + slice.total) % slice.total < p_limit
      and slice.workspace_id <> all (v_dirty)
      and slice.workspace_id <> all (v_rollover)
      and slice.workspace_id <> all (v_periodic)
  ) due;

  foreach v_workspace in array v_dirty || v_rollover || v_periodic || v_balance loop
    v_result := private.evaluate_workspace_spend_rules(v_workspace, p_now, coalesce(p_blocks, false));
    if coalesce((v_result ->> 'missing')::boolean, false) then
      continue;
    end if;
    v_evaluated := v_evaluated + 1;
    v_rules := v_rules + coalesce((v_result ->> 'rules')::integer, 0);
    v_fired := v_fired + coalesce((v_result ->> 'fired')::integer, 0);
    v_state_rows := v_state_rows + coalesce((v_result ->> 'state_rows')::integer, 0);
    if jsonb_array_length(v_result -> 'events') > 0 then
      v_events := v_events || (
        select jsonb_agg(event || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'events') event
      );
    end if;
    if jsonb_array_length(coalesce(v_result -> 'blocks', '[]'::jsonb)) > 0 then
      v_blocks := v_blocks || (
        select jsonb_agg(block || jsonb_build_object('workspace_id', v_workspace))
        from jsonb_array_elements(v_result -> 'blocks') block
      );
    end if;
    if coalesce((v_result ->> 'block_scope')::boolean, false) then
      v_publish := v_publish || v_workspace;
    end if;
  end loop;

  return jsonb_build_object(
    'dirty', cardinality(v_dirty),
    'rollover', cardinality(v_rollover),
    'periodic', cardinality(v_periodic),
    'balance', cardinality(v_balance),
    'evaluated', v_evaluated,
    'rules', v_rules,
    'fired', v_fired,
    'state_rows', v_state_rows,
    'events', v_events,
    'blocks', v_blocks,
    'publish', to_jsonb(v_publish)
  );
end;
$function$;

COMMENT ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) IS 'Evaluates spend rules for dirty workspaces (claimed with SKIP LOCKED), workspaces whose rule periods rolled over or whose blocks reached their reset, an hourly slice of all workspaces with enabled rules, and a 15-minute slice of workspaces with balance rules. Queues alerts, lifts blocks and, with p_blocks, starts them. Called every 5 minutes by the API scheduled job when SPEND_RULES_ENABLED is true (p_blocks = SPEND_RULE_BLOCKS_ENABLED).';

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_rules"(timestamp with time zone, integer, boolean) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.preview_workspace_spend_rule (
  p_workspace_id uuid,
  p_rule_id      uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Where a spend rule stands at p_now, computed as the evaluator computes it
-- (private.spend_rule_values) without writing anything: the current period, the value so far,
-- the base and percent, the highest threshold reached, the next threshold, the block point,
-- this period's state row, and the text an alert would carry now (private.spend_rule_alert_text,
-- naming the highest threshold reached, else the first). Used by the control API and web-api
-- preview and by test sends. Balance rules get the rolling burn window as period, the available
-- balance as value, a "balance" object (balance, reserved, available, burn and burn per day,
-- runway, which threshold holds, armed, whether auto top-up covers a drop) and the alert text
-- (private.spend_balance_rule_values / spend_balance_alert_text). Other rules without a calendar
-- period (rolling, spike) get period, value and alert null. evaluated is false for rules the evaluator does not handle yet
-- (private.spend_rule_evaluable). Errors: spend_rule_not_found (deleted, or another workspace).
declare
  v_rule public.workspace_spend_rules;
  v_workspace_name text;
  v_time_zone text;
  v_evaluated boolean;
  v_value record;
  v_state record;
  v_reached integer;
  v_next integer;
  v_next_nanos numeric;
  v_block_nanos numeric;
  v_alert record;
  v_has_alert boolean := false;
  v_has_state boolean := false;
  v_balance record;
  v_has_balance boolean := false;
begin
  if p_workspace_id is null or p_rule_id is null or p_now is null then
    raise exception 'invalid_spend_rule_preview' using errcode = '22023';
  end if;

  select rule.* into v_rule
  from public.workspace_spend_rules rule
  where rule.id = p_rule_id and rule.workspace_id = p_workspace_id and rule.deleted_at is null;
  if not found then
    raise exception 'spend_rule_not_found' using errcode = 'P0002';
  end if;

  select w.name, coalesce(v_rule.time_zone, settings.billing_time_zone, 'UTC')
    into v_workspace_name, v_time_zone
  from public.workspaces w
  left join public.workspace_settings settings on settings.workspace_id = w.id
  where w.id = p_workspace_id;

  v_evaluated := private.spend_rule_evaluable(v_rule.metric, v_rule.period, v_rule.base_kind);

  if v_rule.metric = 'balance' then
    -- Balance rules: the available balance, the burn over the lookback window and the runway, as
    -- the evaluator sees them (private.spend_balance_rule_values), the armed state and the text.
    select computed.* into v_balance from private.spend_balance_rule_values(p_workspace_id, p_now, p_rule_id) computed;
    v_has_balance := found;
    select state.armed, state.amount_fired_at, state.last_fired_at, state.fire_count
      into v_state
    from public.workspace_spend_rule_state state
    where state.rule_id = v_rule.id and state.period_start = '-infinity'::timestamptz;
    v_has_state := found;
    if v_has_balance then
      -- The text an alert would carry now: the threshold that holds, else the balance amount if
      -- the rule has one, else the runway.
      select alert.* into v_alert
      from private.spend_balance_alert_text(
        v_rule.name, v_balance.available_nanos, v_rule.threshold_amount_nanos, v_rule.runway_days, v_balance.burn_per_day_nanos,
        v_balance.runway_days_left, v_rule.window_hours,
        case
          when v_balance.low_balance then 'balance'
          when v_balance.low_runway then 'runway'
          when v_rule.threshold_amount_nanos is not null then 'balance'
          else 'runway'
        end
      ) alert;
      v_has_alert := found;
    end if;
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', case when v_rule.window_hours is not null then jsonb_build_object(
        'kind', 'rolling', 'start', p_now - make_interval(hours => v_rule.window_hours), 'end', p_now) end,
      'value_nanos', case when v_has_balance then v_balance.available_nanos end,
      'base_kind', null,
      'base_ref', null,
      'base_nanos', null,
      'percent', null,
      'threshold_percents', null,
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'balance', case when v_has_balance then jsonb_build_object(
        'balance_nanos', v_balance.balance_nanos,
        'reserved_nanos', v_balance.reserved_nanos,
        'available_nanos', v_balance.available_nanos,
        'window_hours', v_rule.window_hours,
        'burn_nanos', round(v_balance.burn_nanos),
        'burn_per_day_nanos', round(v_balance.burn_per_day_nanos),
        'runway_days_left', v_balance.runway_days_left,
        'runway_days', v_rule.runway_days,
        'low_balance', v_balance.low_balance,
        'low_runway', v_balance.low_runway,
        'armed', coalesce(v_state.armed, true),
        'auto_top_up_covers', private.workspace_auto_top_up_covers(p_workspace_id)
      ) end,
      'state', case when v_has_state then jsonb_build_object(
        'highest_percent_fired', null,
        'amount_fired_at', v_state.amount_fired_at,
        'last_fired_at', v_state.last_fired_at,
        'fire_count', v_state.fire_count,
        'armed', v_state.armed
      ) end,
      'alert', case when v_has_alert then jsonb_build_object(
        'scope_label', coalesce(nullif(btrim(v_workspace_name), ''), 'Workspace'),
        'title', v_alert.title,
        'message', v_alert.message
      ) end
    );
  end if;

  select computed.* into v_value from private.spend_rule_values(p_workspace_id, p_now, p_rule_id) computed;
  if not found then
    return jsonb_build_object(
      'rule_id', v_rule.id,
      'metric', v_rule.metric,
      'evaluated', v_evaluated,
      'computed_at', p_now,
      'time_zone', v_time_zone,
      'period', null,
      'value_nanos', null,
      'base_kind', v_rule.base_kind,
      'base_ref', v_rule.base_ref,
      'base_nanos', null,
      'percent', null,
      'threshold_percents', to_jsonb(v_rule.threshold_percents),
      'threshold_amount_nanos', v_rule.threshold_amount_nanos,
      'reached_threshold_percent', null,
      'next_threshold', null,
      'block_at_nanos', null,
      'state', null,
      'alert', null
    );
  end if;

  select state.highest_percent_fired, state.amount_fired_at, state.last_fired_at, state.fire_count
    into v_state
  from public.workspace_spend_rule_state state
  where state.rule_id = v_rule.id and state.period_start = v_value.period_start;
  v_has_state := found;

  if v_rule.metric in ('budget_percent', 'forecast') and v_value.base_nanos > 0 and v_rule.threshold_percents is not null then
    select
      max(threshold) filter (where v_value.value_nanos * 100 >= threshold::numeric * v_value.base_nanos),
      min(threshold) filter (where v_value.value_nanos * 100 < threshold::numeric * v_value.base_nanos)
      into v_reached, v_next
    from unnest(v_rule.threshold_percents) threshold;
    v_next_nanos := ceil(v_next::numeric * v_value.base_nanos / 100);
  elsif v_rule.threshold_amount_nanos is not null and v_value.value_nanos < v_rule.threshold_amount_nanos then
    v_next_nanos := v_rule.threshold_amount_nanos;
  end if;

  if v_rule.action = 'block' then
    v_block_nanos := case
      when v_rule.metric = 'spend' then v_rule.block_at_amount_nanos
      when v_value.base_nanos > 0 then ceil(v_rule.block_at_percent::numeric * v_value.base_nanos / 100)
    end;
  end if;

  if v_rule.metric = 'spend' or (v_rule.metric = 'budget_percent' and v_value.base_nanos > 0) then
    select alert.* into v_alert
    from private.spend_rule_alert_text(
      v_workspace_name, v_rule.name, v_rule.metric, v_rule.scope_type, v_rule.scope_id, v_rule.scope_key_id,
      v_rule.scope_user_id, v_rule.scope_department_id, v_rule.period, v_value.period_end, v_value.time_zone,
      v_rule.base_kind, v_rule.base_ref, v_value.base_nanos, v_rule.threshold_percents, v_rule.threshold_amount_nanos,
      v_value.value_nanos, coalesce(v_reached, v_rule.threshold_percents[1])
    ) alert;
    v_has_alert := found;
  end if;

  return jsonb_build_object(
    'rule_id', v_rule.id,
    'metric', v_rule.metric,
    'evaluated', v_evaluated,
    'computed_at', p_now,
    'time_zone', v_value.time_zone,
    'period', jsonb_build_object('kind', v_rule.period, 'start', v_value.period_start, 'end', v_value.period_end),
    'value_nanos', v_value.value_nanos,
    'base_kind', v_rule.base_kind,
    'base_ref', v_rule.base_ref,
    'base_nanos', v_value.base_nanos,
    'percent', case when v_value.base_nanos > 0 then round(v_value.value_nanos * 100 / v_value.base_nanos, 1) end,
    'threshold_percents', to_jsonb(v_rule.threshold_percents),
    'threshold_amount_nanos', v_rule.threshold_amount_nanos,
    'reached_threshold_percent', v_reached,
    'next_threshold', case when v_next_nanos is not null then jsonb_build_object('percent', v_next, 'amount_nanos', v_next_nanos) end,
    'block_at_nanos', v_block_nanos,
    'state', case when v_has_state then jsonb_build_object(
      'highest_percent_fired', v_state.highest_percent_fired,
      'amount_fired_at', v_state.amount_fired_at,
      'last_fired_at', v_state.last_fired_at,
      'fire_count', v_state.fire_count
    ) end,
    'alert', case when v_has_alert then jsonb_build_object(
      'scope_label', v_alert.scope_label,
      'title', v_alert.title,
      'message', v_alert.message
    ) end
  );
end;
$function$;

COMMENT ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) IS 'Read-only preview of a spend rule at p_now: period, value, base, percent, thresholds reached and next, block point, state and the alert text, computed by the evaluator''s own functions. Service role only (control API and web-api).';

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_workspace_spend_rule"(uuid, uuid, timestamp with time zone) FROM "anon", "authenticated";
