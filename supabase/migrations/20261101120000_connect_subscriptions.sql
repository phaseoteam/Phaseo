-- Phaseo Connect billing: $1 a month from credits, prorated by the UTC days it was on, charged in arrears.
-- * connect_subscriptions: the workspace's switch and whether a month is unpaid (payment_due).
-- * connect_subscription_periods: append-only stretches Connect was on, so proration is exact.
-- * connect_charges: one charge per workspace and finished month, fixed at the first attempt.
-- * private.connect_days_on: UTC days with Connect on at any moment.
-- * public.set_connect_enabled, get_connect_state, get_connect_entitlement (for the relay),
--   list_connect_due_charges and charge_connect_month (one credit_ledger row, ref_type connect_month).
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

CREATE TABLE "public"."connect_subscriptions" (
  "workspace_id" uuid                     NOT NULL,
  "enabled"      boolean                  NOT NULL DEFAULT false,
  "payment_due"  boolean                  NOT NULL DEFAULT false,
  "enabled_at"   timestamp with time zone,
  "disabled_at"  timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by"   uuid,
  CONSTRAINT "connect_subscriptions_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "connect_subscriptions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscriptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER connect_subscriptions_set_updated_at
  BEFORE UPDATE ON public.connect_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."connect_subscriptions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."connect_subscriptions"."enabled" IS 'Whether the workspace wants Phaseo Connect on: the switch in the desktop app. Changed only through public.set_connect_enabled.';

COMMENT ON COLUMN "public"."connect_subscriptions"."payment_due" IS 'A finished month''s Connect charge could not be taken from credits. Connect is off (no billing period open, the relay refuses the desktop) until charge_connect_month takes every pending month, then it resumes if enabled.';

COMMENT ON TABLE "public"."connect_subscriptions" IS 'Phaseo Connect (the phone relay, $1 a month from credits, prorated by the UTC days it was on) for each workspace. The days billed come from connect_subscription_periods. Service role reads only; changes go through set_connect_enabled and charge_connect_month.';

REVOKE ALL ON TABLE "public"."connect_subscriptions" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_subscriptions" FROM "anon", "authenticated";

CREATE TABLE "public"."connect_subscription_periods" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY,
  "workspace_id" uuid                     NOT NULL,
  "started_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "started_by"   uuid,
  "ended_at"     timestamp with time zone,
  "ended_by"     uuid,
  "ended_reason" text,
  CONSTRAINT "connect_subscription_periods_ended_check" CHECK ((((ended_at IS NULL) AND (ended_reason IS NULL) AND (ended_by IS NULL)) OR ((ended_at >= started_at) AND (ended_reason = ANY (ARRAY['turned_off'::text, 'payment_due'::text]))))),
  CONSTRAINT "connect_subscription_periods_ended_by_fkey" FOREIGN KEY (ended_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscription_periods_pkey" PRIMARY KEY (id),
  CONSTRAINT "connect_subscription_periods_started_by_fkey" FOREIGN KEY (started_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "connect_subscription_periods_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.connect_subscriptions(workspace_id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_subscription_periods"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX connect_subscription_periods_open_idx ON public.connect_subscription_periods USING btree (workspace_id)
  WHERE (ended_at IS NULL);

CREATE INDEX connect_subscription_periods_workspace_idx ON public.connect_subscription_periods USING btree (workspace_id, started_at);

CREATE POLICY "deny_direct_client_access" ON "public"."connect_subscription_periods"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."connect_subscription_periods" IS 'Each stretch Phaseo Connect was on for a workspace, so proration is exact: a UTC day is billed if any period overlaps it. Append-only: set_connect_enabled opens a period and later sets its end once; charge_connect_month ends it while a month is unpaid. At most one open period per workspace.';

REVOKE ALL ON TABLE "public"."connect_subscription_periods" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_subscription_periods" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_subscription_periods" FROM "anon", "authenticated";

CREATE TABLE "public"."connect_charges" (
  "workspace_id"  uuid                     NOT NULL,
  "period_start"  date                     NOT NULL,
  "days_on"       integer                  NOT NULL,
  "days_in_month" integer                  NOT NULL,
  "amount_nanos"  bigint                   NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'pending'::text,
  "attempted_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "charged_at"    timestamp with time zone,
  "ledger_ref_id" text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "connect_charges_charged_check" CHECK (((status = 'charged'::text) = (charged_at IS NOT NULL))),
  CONSTRAINT "connect_charges_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "connect_charges_pkey" PRIMARY KEY (workspace_id, period_start),
  CONSTRAINT "connect_charges_quantities_check" CHECK (((days_on >= 1) AND (days_on <= days_in_month) AND (days_in_month >= 28) AND (days_in_month <= 31) AND (amount_nanos >= 0) AND (amount_nanos <= 1000000000))),
  CONSTRAINT "connect_charges_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'charged'::text]))),
  CONSTRAINT "connect_charges_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."connect_charges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX connect_charges_pending_idx ON public.connect_charges USING btree (attempted_at)
  WHERE (status = 'pending'::text);

CREATE TRIGGER connect_charges_set_updated_at
  BEFORE UPDATE ON public.connect_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."connect_charges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."connect_charges" IS 'Phaseo Connect''s charge for each workspace and finished UTC month: $1 times the days it was on over the days in the month, rounded down to the nanodollar, taken from credits by charge_connect_month as one credit_ledger charge (ref_type connect_month). A charge stays pending while the balance is too low and is retried at the amount fixed by its first attempt.';

REVOKE ALL ON TABLE "public"."connect_charges" FROM "service_role";

GRANT SELECT ON TABLE "public"."connect_charges" TO "service_role";

REVOKE ALL ON TABLE "public"."connect_charges" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.connect_days_on (
  p_workspace_id uuid,
  p_from         date,
  p_to           date
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- UTC days in [p_from, p_to) on which Connect was on at any moment. A period
  -- that ends exactly at midnight does not reach into the next day.
  select count(*)::integer
  from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') as day (day_start)
  where exists (
    select 1 from public.connect_subscription_periods period
    where period.workspace_id = p_workspace_id
      and period.started_at < ((day.day_start + interval '1 day') at time zone 'utc')
      and (period.ended_at is null or period.ended_at > (day.day_start at time zone 'utc'))
  );
$function$;

COMMENT ON FUNCTION "private"."connect_days_on"(uuid, date, date) IS 'The UTC days from p_from up to (not including) p_to on which Phaseo Connect was on at any moment for the workspace, from connect_subscription_periods.';

REVOKE ALL ON FUNCTION "private"."connect_days_on"(uuid, date, date) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."connect_days_on"(uuid, date, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."connect_days_on"(uuid, date, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."connect_days_on"(uuid, date, date) TO "service_role";

CREATE OR REPLACE FUNCTION public.set_connect_enabled (
  p_workspace_id uuid,
  p_enabled      boolean,
  p_user_id      uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_subscription public.connect_subscriptions%rowtype;
begin
  if p_workspace_id is null or p_enabled is null then
    raise exception 'invalid_argument' using errcode = '22023';
  end if;

  insert into public.connect_subscriptions (workspace_id, updated_by)
  values (p_workspace_id, p_user_id)
  on conflict (workspace_id) do nothing;

  -- The row lock serialises switching with charge_connect_month, which also
  -- opens and closes periods.
  select * into v_subscription from public.connect_subscriptions subscription
  where subscription.workspace_id = p_workspace_id
  for update;

  if v_subscription.enabled = p_enabled then
    return false;
  end if;

  if p_enabled then
    update public.connect_subscriptions subscription
    set enabled = true, enabled_at = now(), updated_by = p_user_id
    where subscription.workspace_id = p_workspace_id;
    -- While a month is unpaid no period opens, so no days are billed; paying it opens one.
    if not v_subscription.payment_due then
      insert into public.connect_subscription_periods (workspace_id, started_by)
      values (p_workspace_id, p_user_id);
    end if;
  else
    update public.connect_subscriptions subscription
    set enabled = false, disabled_at = now(), updated_by = p_user_id
    where subscription.workspace_id = p_workspace_id;
    update public.connect_subscription_periods period
    set ended_at = now(), ended_by = p_user_id, ended_reason = 'turned_off'
    where period.workspace_id = p_workspace_id and period.ended_at is null;
  end if;
  return true;
end;
$function$;

COMMENT ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) IS 'Turns Phaseo Connect on or off for a workspace and opens or closes its billing period. Returns whether anything changed. Turning it on while a month is unpaid records the choice but bills nothing until the month is paid.';

GRANT EXECUTE ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_connect_enabled"(uuid, boolean, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_connect_state (
  p_workspace_id uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS TABLE (
    enabled             boolean,
    payment_due         boolean,
    enabled_at          timestamp with time zone,
    disabled_at         timestamp with time zone,
    period_start        date,
    days_on             integer,
    days_in_month       integer,
    charge_so_far_nanos bigint,
    estimated_nanos     bigint,
    pending_nanos       bigint,
    pending_months      integer
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- What the desktop's Connect switch shows, counted here so callers never sum
  -- rows. The estimate assumes Connect stays as it is until the month ends; both
  -- amounts round down to the nanodollar like the charge itself.
  with month as (
    select date_trunc('month', p_now at time zone 'utc')::date as period_start,
      (p_now at time zone 'utc')::date as today
  ), sized as (
    select month.period_start, month.today,
      extract(day from (month.period_start + interval '1 month' - interval '1 day'))::integer as days_in_month,
      private.connect_days_on(p_workspace_id, month.period_start, month.today + 1) as days_on
    from month
  ), state as (
    select coalesce(subscription.enabled, false) as enabled,
      coalesce(subscription.payment_due, false) as payment_due,
      subscription.enabled_at, subscription.disabled_at, sized.*
    from sized
    left join public.connect_subscriptions subscription on subscription.workspace_id = p_workspace_id
  )
  select state.enabled, state.payment_due, state.enabled_at, state.disabled_at, state.period_start,
    state.days_on, state.days_in_month,
    (1000000000::bigint * state.days_on) / state.days_in_month,
    (1000000000::bigint * (state.days_on + case when state.enabled and not state.payment_due
      then state.days_in_month - extract(day from state.today)::integer else 0 end)) / state.days_in_month,
    coalesce(pending.amount, 0)::bigint,
    coalesce(pending.months, 0)::integer
  from state
  left join lateral (
    select sum(charge.amount_nanos) as amount, count(*) as months
    from public.connect_charges charge
    where charge.workspace_id = p_workspace_id and charge.status = 'pending'
  ) pending on true;
$function$;

COMMENT ON FUNCTION "public"."get_connect_state"(uuid, timestamp with time zone) IS 'Phaseo Connect''s state for a workspace: on or off, whether a month is unpaid, this UTC month''s days on so far, the charge for them, the month-end estimate if nothing changes, and unpaid months.';

GRANT EXECUTE ON FUNCTION "public"."get_connect_state"(uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_connect_state"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_connect_state"(uuid, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_connect_state"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.get_connect_entitlement (
  p_workspace_id uuid
)
  RETURNS TABLE (
    enabled boolean,
    paid_up boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- For the Connect relay: paid_up needs every finished month paid and a
  -- positive available balance (reserved gateway spend excluded).
  select coalesce(subscription.enabled, false),
    coalesce(not subscription.payment_due, false)
      and coalesce(wallet.balance_nanos - wallet.reserved_nanos > 0, false)
  from (select p_workspace_id as workspace_id) target
  left join public.connect_subscriptions subscription on subscription.workspace_id = target.workspace_id
  left join public.wallets wallet on wallet.workspace_id = target.workspace_id;
$function$;

COMMENT ON FUNCTION "public"."get_connect_entitlement"(uuid) IS 'Whether the Phaseo Connect relay may serve a workspace: enabled (the switch is on) and paid_up (no unpaid month and a positive available credit balance).';

GRANT EXECUTE ON FUNCTION "public"."get_connect_entitlement"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_connect_entitlement"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_connect_entitlement"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_connect_entitlement"(uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.list_connect_due_charges (
  p_before date,
  p_limit  integer DEFAULT 200
)
  RETURNS TABLE (
    workspace_id uuid,
    period_start date
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Finished UTC months before p_before in which Connect was on for at least a
  -- day and that have no completed charge. Never-tried months come first, then
  -- the longest-waiting retries, so workspaces short of credits cannot starve the rest.
  with months as (
    select distinct period.workspace_id, month.month_start::date as period_start
    from public.connect_subscription_periods period
    cross join lateral generate_series(
      date_trunc('month', period.started_at at time zone 'utc'),
      date_trunc('month', coalesce(period.ended_at, now()) at time zone 'utc'),
      interval '1 month'
    ) as month (month_start)
    where month.month_start < p_before
  )
  select months.workspace_id, months.period_start
  from months
  left join public.connect_charges charge
    on charge.workspace_id = months.workspace_id and charge.period_start = months.period_start
  where coalesce(charge.status, 'pending') = 'pending'
    and private.connect_days_on(months.workspace_id, months.period_start, (months.period_start + interval '1 month')::date) > 0
  order by charge.attempted_at nulls first, months.period_start, months.workspace_id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

COMMENT ON FUNCTION "public"."list_connect_due_charges"(date, integer) IS 'Each workspace and finished UTC month with at least one Phaseo Connect day that has not been charged yet, for the month-end charge job.';

GRANT EXECUTE ON FUNCTION "public"."list_connect_due_charges"(date, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_connect_due_charges"(date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_connect_due_charges"(date, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_connect_due_charges"(date, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.charge_connect_month (
  p_workspace_id uuid,
  p_period_start date
)
  RETURNS TABLE (
    status               text,
    days_on              integer,
    amount_nanos         bigint,
    before_balance_nanos bigint,
    after_balance_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_column
declare
  -- $1 a month in nanodollars, the unit of wallets and credit_ledger.
  c_monthly_price_nanos constant bigint := 1000000000;
  v_subscription public.connect_subscriptions%rowtype;
  v_charge public.connect_charges%rowtype;
  v_wallet public.wallets%rowtype;
  v_days integer;
  v_days_in_month integer;
  v_amount bigint;
  v_ref text;
  v_ledger_id uuid;
begin
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_period_start' using errcode = '22023';
  end if;
  if p_period_start >= date_trunc('month', now() at time zone 'utc')::date then
    raise exception 'period_not_finished' using errcode = '22023';
  end if;

  -- Waits for a concurrent set_connect_enabled, which also opens and closes periods.
  select * into v_subscription from public.connect_subscriptions subscription
  where subscription.workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'subscription_not_found' using errcode = 'P0002';
  end if;

  v_days_in_month := extract(day from (p_period_start + interval '1 month' - interval '1 day'))::integer;
  v_days := private.connect_days_on(p_workspace_id, p_period_start, (p_period_start + interval '1 month')::date);
  if v_days = 0 and not exists (
    select 1 from public.connect_charges charge
    where charge.workspace_id = p_workspace_id and charge.period_start = p_period_start
  ) then
    return query select 'nothing_due'::text, 0, 0::bigint, null::bigint, null::bigint;
    return;
  end if;

  -- Arrears proration, rounded down: integer division of non-negative values
  -- truncates, so the customer never pays a fraction of a nanodollar extra.
  -- The first attempt fixes the days and amount; retries while credits are
  -- short charge exactly that. The row lock also makes a concurrent run wait
  -- here and then see the month charged.
  insert into public.connect_charges as charge
    (workspace_id, period_start, days_on, days_in_month, amount_nanos, attempted_at)
  values (p_workspace_id, p_period_start, v_days, v_days_in_month,
    (c_monthly_price_nanos * v_days) / v_days_in_month, now())
  on conflict (workspace_id, period_start) do update
  set attempted_at = excluded.attempted_at
  where charge.status = 'pending'
  returning * into v_charge;

  if not found then
    select * into v_charge from public.connect_charges charge
    where charge.workspace_id = p_workspace_id and charge.period_start = p_period_start;
    return query select 'already_charged'::text, v_charge.days_on, v_charge.amount_nanos, null::bigint, null::bigint;
    return;
  end if;

  v_amount := v_charge.amount_nanos;
  v_ref := p_workspace_id::text || ':' || to_char(p_period_start, 'YYYY-MM');

  if v_amount > 0 then
    select * into v_wallet from public.wallets wallet
    where wallet.workspace_id = p_workspace_id
    for update;

    -- Never takes the wallet below what is reserved for in-flight gateway requests.
    if not found or v_wallet.balance_nanos - v_wallet.reserved_nanos < v_amount then
      update public.connect_subscriptions subscription set payment_due = true
      where subscription.workspace_id = p_workspace_id;
      update public.connect_subscription_periods period
      set ended_at = now(), ended_reason = 'payment_due'
      where period.workspace_id = p_workspace_id and period.ended_at is null;
      return query select
        (case when v_wallet.workspace_id is null then 'wallet_not_found' else 'insufficient_balance' end)::text,
        v_charge.days_on, v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos;
      return;
    end if;

    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      p_workspace_id, 'charge', -v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos - v_amount,
      'connect_month', v_ref, 'connect_subscription', p_workspace_id::text, 'captured'
    )
    on conflict (ref_type, ref_id) do nothing
    returning id into v_ledger_id;

    -- A ledger row without a charged month can only come from a manual repair; never debit twice.
    if v_ledger_id is not null then
      update public.wallets wallet
      set balance_nanos = wallet.balance_nanos - v_amount, updated_at = now()
      where wallet.workspace_id = p_workspace_id;
    end if;
  end if;

  update public.connect_charges charge
  set status = 'charged', charged_at = now(), ledger_ref_id = case when v_amount > 0 then v_ref end
  where charge.workspace_id = p_workspace_id and charge.period_start = p_period_start;

  -- Every unpaid month is now paid: Connect resumes if it is still switched on.
  if v_subscription.payment_due and not exists (
    select 1 from public.connect_charges charge
    where charge.workspace_id = p_workspace_id and charge.status = 'pending'
  ) then
    update public.connect_subscriptions subscription set payment_due = false
    where subscription.workspace_id = p_workspace_id;
    if v_subscription.enabled then
      insert into public.connect_subscription_periods (workspace_id) values (p_workspace_id);
    end if;
  end if;

  return query select
    (case when v_amount > 0 and v_ledger_id is null then 'already_charged' else 'charged' end)::text,
    v_charge.days_on,
    v_amount,
    case when v_amount > 0 then v_wallet.balance_nanos end,
    case when v_amount > 0 then v_wallet.balance_nanos - (case when v_ledger_id is null then 0 else v_amount end) end;
end;
$function$;

COMMENT ON FUNCTION "public"."charge_connect_month"(uuid, date) IS 'Takes one workspace''s Phaseo Connect charge for a finished UTC month from credits: $1 times the days it was on over the days in the month, rounded down to the nanodollar and fixed at the first attempt, as a single credit_ledger charge (ref_type connect_month, idempotent per workspace and month). If the available balance is too low the month stays pending, Connect pauses (payment_due) and the next call retries; paying every pending month resumes it.';

GRANT EXECUTE ON FUNCTION "public"."charge_connect_month"(uuid, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."charge_connect_month"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."charge_connect_month"(uuid, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."charge_connect_month"(uuid, date) FROM PUBLIC, "anon", "authenticated";
