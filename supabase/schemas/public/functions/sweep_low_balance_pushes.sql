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
--     since the last card payment.
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
      case
        when w.auto_top_up_enabled and w.auto_top_up_amount >= 1000000000 and w.low_balance_threshold > 0
          and s.auto_top_up_failure_email_enabled is distinct from false
          then not exists (
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
        else false
      end as top_up_covers,
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
