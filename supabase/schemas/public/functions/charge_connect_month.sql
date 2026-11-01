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
