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
