CREATE OR REPLACE FUNCTION public.claim_workspace_top_up_fee_policy (
  p_workspace_id             uuid,
  p_stripe_payment_intent_id text,
  p_gross_nanos              bigint,
  p_payment_rail             text,
  p_seen_at                  timestamp with time zone DEFAULT now()
)
  RETURNS TABLE (
    fee_waived             boolean,
    reason                 text,
    allowance_before_nanos bigint,
    allowance_after_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_period_start date := date_trunc('month', p_seen_at at time zone 'UTC')::date;
  v_subscription public.workspace_addon_subscriptions%rowtype;
  v_used bigint := 0;
  v_waived boolean := false;
  v_reason text := 'standard_fee';
  v_before bigint := 0;
  v_after bigint := 0;
begin
  if p_gross_nanos < 0 or p_stripe_payment_intent_id is null or trim(p_stripe_payment_intent_id) = '' then
    raise exception 'invalid top-up fee claim';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::text || ':' || v_period_start::text || ':top_up_fee', 0)
  );

  return query
  select d.fee_waived, d.reason, d.allowance_before_nanos, d.allowance_after_nanos
  from public.workspace_top_up_fee_decisions d
  where d.stripe_payment_intent_id = p_stripe_payment_intent_id;
  if found then return; end if;

  select * into v_subscription
  from public.workspace_addon_subscriptions s
  where s.workspace_id = p_workspace_id
    and s.addon_key = 'identity'
    and (
      s.status in ('active', 'trialing')
      or (s.status = 'past_due' and s.grace_until > p_seen_at)
    )
  limit 1;

  if v_subscription.id is not null and v_subscription.fee_policy = 'included_allowance' then
    select coalesce(sum(d.gross_nanos), 0) into v_used
    from public.workspace_top_up_fee_decisions d
    where d.workspace_id = p_workspace_id
      and d.period_start = v_period_start
      and d.fee_waived
      and d.payment_rail <> 'bank_transfer';
    v_before := greatest(v_subscription.included_card_top_up_nanos - v_used, 0);

    if p_payment_rail = 'bank_transfer' then
      v_waived := true;
      v_reason := 'included_bank_transfer';
      v_after := v_before;
    elsif p_gross_nanos <= v_before then
      v_waived := true;
      v_reason := 'included_card_allowance';
      v_after := v_before - p_gross_nanos;
    else
      v_reason := 'allowance_exceeded';
      v_after := v_before;
    end if;
  elsif v_subscription.id is null then
    v_reason := 'no_active_subscription';
  end if;

  insert into public.workspace_top_up_fee_decisions (
    stripe_payment_intent_id, workspace_id, period_start, payment_rail,
    gross_nanos, fee_waived, allowance_before_nanos, allowance_after_nanos, reason
  ) values (
    p_stripe_payment_intent_id, p_workspace_id, v_period_start,
    case when p_payment_rail in ('card', 'ach', 'bank_transfer') then p_payment_rail else 'unknown' end,
    p_gross_nanos, v_waived, v_before, v_after, v_reason
  );

  return query select v_waived, v_reason, v_before, v_after;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."claim_workspace_top_up_fee_policy"(uuid, text, bigint, text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_workspace_top_up_fee_policy"(uuid, text, bigint, text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_workspace_top_up_fee_policy"(uuid, text, bigint, text, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_workspace_top_up_fee_policy"(uuid, text, bigint, text, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
