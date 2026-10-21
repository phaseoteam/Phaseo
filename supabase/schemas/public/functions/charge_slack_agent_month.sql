CREATE OR REPLACE FUNCTION public.charge_slack_agent_month (
  p_installation_id uuid,
  p_period_start    date,
  p_people          integer,
  p_answers         bigint,
  p_amount_nanos    bigint
)
  RETURNS TABLE (
    status               text,
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
  v_installation public.slack_installations%rowtype;
  v_charge public.slack_agent_charges%rowtype;
  v_wallet public.wallets%rowtype;
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
  if coalesce(p_people, -1) < 0 or coalesce(p_answers, -1) < 0 or coalesce(p_amount_nanos, -1) < 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select * into v_installation from public.slack_installations where id = p_installation_id;
  if not found then
    raise exception 'installation_not_found' using errcode = 'P0002';
  end if;

  -- The first attempt fixes the month's people, answers and amount, capped at the
  -- spending cap set in Settings. Retries while credits are short charge exactly
  -- that, even if prices, the cap or late usage change afterwards. The row lock
  -- also makes a concurrent run wait here and then see the month charged.
  insert into public.slack_agent_charges as charge
    (installation_id, workspace_id, period_start, people, answers, amount_nanos, attempted_at)
  values (p_installation_id, v_installation.workspace_id, p_period_start, p_people, p_answers,
    least(p_amount_nanos, v_installation.monthly_cap_nanos), now())
  on conflict (installation_id, period_start) do update
  set attempted_at = excluded.attempted_at
  where charge.status = 'pending'
  returning * into v_charge;

  if not found then
    select * into v_charge from public.slack_agent_charges charge
    where charge.installation_id = p_installation_id and charge.period_start = p_period_start;
    return query select 'already_charged'::text, v_charge.amount_nanos, null::bigint, null::bigint;
    return;
  end if;

  v_amount := v_charge.amount_nanos;
  v_ref := p_installation_id::text || ':' || to_char(p_period_start, 'YYYY-MM');

  if v_amount > 0 then
    select * into v_wallet from public.wallets wallet
    where wallet.workspace_id = v_installation.workspace_id
    for update;

    if not found or v_wallet.balance_nanos - v_wallet.reserved_nanos < v_amount then
      update public.slack_installations installation set status = 'payment_due'
      where installation.id = p_installation_id and installation.status = 'active';
      return query select
        (case when v_wallet.workspace_id is null then 'wallet_not_found' else 'insufficient_balance' end)::text,
        v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos;
      return;
    end if;

    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      v_installation.workspace_id, 'charge', -v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos - v_amount,
      'slack_agent_month', v_ref, 'slack_installation', p_installation_id::text, 'captured'
    )
    on conflict (ref_type, ref_id) do nothing
    returning id into v_ledger_id;

    -- A ledger row without a charged month can only come from a manual repair; never debit twice.
    if v_ledger_id is not null then
      update public.wallets wallet
      set balance_nanos = wallet.balance_nanos - v_amount, updated_at = now()
      where wallet.workspace_id = v_installation.workspace_id;
    end if;
  end if;

  update public.slack_agent_charges charge
  set status = 'charged', charged_at = now(), ledger_ref_id = case when v_amount > 0 then v_ref end
  where charge.installation_id = p_installation_id and charge.period_start = p_period_start;

  update public.slack_installations installation set status = 'active'
  where installation.id = p_installation_id and installation.status = 'payment_due'
    and not exists (
      select 1 from public.slack_agent_charges charge
      where charge.installation_id = p_installation_id and charge.status = 'pending'
    );

  return query select
    (case when v_amount > 0 and v_ledger_id is null then 'already_charged' else 'charged' end)::text,
    v_amount,
    case when v_amount > 0 then v_wallet.balance_nanos end,
    case when v_amount > 0 then v_wallet.balance_nanos - (case when v_ledger_id is null then 0 else v_amount end) end;
end;
$function$;

COMMENT ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) IS 'Takes one installation''s charge for a finished UTC month from credits, capped at its monthly spending cap and fixed at the first attempt, as a single credit_ledger charge (ref_type slack_agent_month, idempotent per installation and month). If the available balance is too low the month stays pending, the installation is marked payment_due, and the next call retries.';

GRANT EXECUTE ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) FROM PUBLIC, "anon", "authenticated";
