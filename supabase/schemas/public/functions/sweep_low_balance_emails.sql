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
