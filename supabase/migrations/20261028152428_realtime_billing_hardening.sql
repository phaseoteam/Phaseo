-- Realtime billing hardening.
--   * gateway_realtime_settle_once never fails for insufficient balance: it captures the full
--     cost from the holds and free balance, lets the wallet go up to $1 negative (recorded as
--     debt_nanos) and records anything beyond that cap as uncollected_nanos instead of retrying.
--     A reserved balance mismatch is clamped, logged and recorded as billing_anomaly.
--     New p_estimated / p_estimate_basis record settlements that include a metered estimate.
--     Confirmed usage already captured for a billing review is never charged twice or refunded.
--   * gateway_realtime_mark_billing_unresolved captures the provider-confirmed cost
--     (p_confirmed_cost_nanos) from the session holds, so a review covers only the remainder.
--   * Billing reviews block only the affected API key (new key_id), resolve and unblock
--     automatically when the session settles, and review_decide no longer caps capture at the
--     holds. Already-resolved reviews that still block access are unblocked.
--   * The provider concurrency cap ignores stuck rows (never claimed, expired or silent).
--   * Hold extension allows connecting sessions and drops a status update that the raise
--     rolled back anyway.
SET local check_function_bodies = off;

ALTER TABLE "public"."gateway_realtime_sessions"
  ADD COLUMN "billing_estimated" boolean NOT NULL DEFAULT false,
  ADD COLUMN "estimate_basis" text,
  ADD COLUMN "debt_nanos" bigint NOT NULL DEFAULT 0,
  ADD COLUMN "uncollected_nanos" bigint NOT NULL DEFAULT 0,
  ADD COLUMN "billing_anomaly" text;

ALTER TABLE "public"."gateway_realtime_sessions"
  ADD CONSTRAINT "gateway_realtime_sessions_debt_nanos_check" CHECK ((debt_nanos >= 0));

ALTER TABLE "public"."gateway_realtime_sessions"
  ADD CONSTRAINT "gateway_realtime_sessions_uncollected_nanos_check" CHECK ((uncollected_nanos >= 0));

CREATE INDEX idx_gateway_realtime_sessions_uncollected ON public.gateway_realtime_sessions USING btree (workspace_id)
  WHERE (uncollected_nanos > 0);

COMMENT ON COLUMN "public"."gateway_realtime_sessions"."billing_estimated" IS 'Part of the settled usage was estimated from metered audio because the provider usage for an interrupted turn never arrived.';

COMMENT ON COLUMN "public"."gateway_realtime_sessions"."debt_nanos" IS 'Charged beyond the session holds and free balance; the wallet went negative by this much (at most the $1 realtime overdraft cap).';

COMMENT ON COLUMN "public"."gateway_realtime_sessions"."uncollected_nanos" IS 'Priced cost beyond the overdraft cap that settlement could not charge. Needs follow-up; settlement does not retry it.';

ALTER TABLE "public"."gateway_realtime_billing_reviews"
  ADD COLUMN "key_id" uuid;

ALTER TABLE "public"."gateway_realtime_billing_reviews"
  ADD CONSTRAINT "gateway_realtime_billing_reviews_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL;

UPDATE public.gateway_realtime_billing_reviews r
SET key_id = s.key_id
FROM public.gateway_realtime_sessions s
WHERE s.session_id = r.session_id AND r.key_id IS NULL;

UPDATE public.gateway_realtime_billing_reviews
SET access_blocked = false, version = version + 1
WHERE status = 'resolved' AND access_blocked;

DROP INDEX public.gateway_realtime_billing_reviews_workspace_id_idx;

CREATE INDEX gateway_realtime_billing_reviews_blocked_key_idx ON public.gateway_realtime_billing_reviews USING btree (workspace_id, key_id)
  WHERE access_blocked;

COMMENT ON COLUMN "public"."gateway_realtime_billing_reviews"."key_id" IS 'API key of the reviewed session. While access_blocked, only new realtime sessions for this key are refused.';

DROP FUNCTION public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text);

DROP FUNCTION public.gateway_realtime_mark_billing_unresolved(uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.gateway_realtime_settle_once (
  p_workspace_id      uuid,
  p_session_id        text,
  p_final_cost_nanos  bigint,
  p_usage             jsonb   DEFAULT '{}'::jsonb,
  p_pricing_lines     jsonb   DEFAULT '[]'::jsonb,
  p_status            text    DEFAULT 'completed'::text,
  p_disconnect_reason text    DEFAULT NULL::text,
  p_error_code        text    DEFAULT NULL::text,
  p_error_message     text    DEFAULT NULL::text,
  p_estimated         boolean DEFAULT false,
  p_estimate_basis    text    DEFAULT NULL::text
)
  RETURNS TABLE (
    applied               boolean,
    already_applied       boolean,
    status                text,
    final_cost_nanos      bigint,
    reserved_nanos        bigint,
    captured_nanos        bigint,
    released_nanos        bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint,
    debt_nanos            bigint,
    uncollected_nanos     bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  -- REALTIME_MAX_OVERDRAFT_NANOS: a settlement may leave the wallet at most $1 negative.
  c_max_overdraft_nanos constant bigint := 1000000000;
  v_session public.gateway_realtime_sessions%rowtype;
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_cost bigint := greatest(0, coalesce(p_final_cost_nanos, 0));
  v_held bigint := 0;
  v_prepaid bigint := 0;
  v_total bigint;
  v_due bigint;
  v_free bigint;
  v_release bigint;
  v_charge bigint;
  v_debt bigint;
  v_uncollected bigint;
  v_anomaly text;
  v_capture_remaining bigint;
  v_row_capture bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_request_count integer;
  v_next_status text := lower(coalesce(nullif(trim(p_status), ''), 'completed'));
begin
  if v_next_status not in ('completed', 'failed', 'cancelled', 'expired') then
    raise exception 'invalid_realtime_terminal_status';
  end if;

  select * into v_session from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, 0::bigint,
      0::bigint, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint, 0::bigint, 0::bigint;
    return;
  end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query select false, true, v_session.status, coalesce(v_session.final_cost_nanos, 0),
      v_session.reserved_nanos, v_session.captured_nanos, v_session.released_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint, v_session.debt_nanos, v_session.uncollected_nanos;
    return;
  end if;

  perform 1 from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
    and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%')
  order by gwr.created_at, gwr.reservation_id
  for update;

  select * into v_wallet from public.wallets
  where workspace_id = p_workspace_id for update;
  if not found then raise exception 'wallet_not_found'; end if;

  select * into v_session from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id for update;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query select false, true, v_session.status, coalesce(v_session.final_cost_nanos, 0),
      v_session.reserved_nanos, v_session.captured_nanos, v_session.released_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint, v_session.debt_nanos, v_session.uncollected_nanos;
    return;
  end if;

  select coalesce(sum(gwr.amount_nanos), 0)::bigint into v_held
  from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
    and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%');

  -- Confirmed usage may already have been captured when the session entered
  -- billing review; only the remainder is charged now, and never refunded.
  v_prepaid := greatest(0, coalesce(v_session.captured_nanos, 0));
  v_total := greatest(v_cost, v_prepaid);
  v_due := v_total - v_prepaid;

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  v_release := v_held;
  if v_before_reserved < v_held then
    -- Clamp instead of failing forever: the session holds are still released.
    v_anomaly := 'reserved_balance_mismatch';
    v_release := greatest(0, v_before_reserved);
    raise warning 'realtime_settlement_reserved_balance_mismatch session=% held=% wallet_reserved=%',
      p_session_id, v_held, v_before_reserved;
  end if;

  -- Charge the full cost from the holds and free balance. Beyond that the
  -- wallet may go negative up to the overdraft cap (recorded as debt); any
  -- remainder is recorded as uncollected instead of retrying settlement.
  v_free := v_before_balance - v_before_reserved;
  v_charge := least(v_due, greatest(v_release, v_free + v_release + c_max_overdraft_nanos));
  v_uncollected := v_due - v_charge;
  v_debt := greatest(0, v_charge - v_release - greatest(0, v_free));
  if v_uncollected > 0 then
    v_anomaly := coalesce(v_anomaly || ',', '') || 'overdraft_cap_reached';
    raise warning 'realtime_settlement_overdraft_cap_reached session=% uncollected=%', p_session_id, v_uncollected;
  end if;

  update public.wallets w
  set balance_nanos = w.balance_nanos - v_charge,
      reserved_nanos = greatest(0, w.reserved_nanos - v_held),
      updated_at = now()
  where workspace_id = p_workspace_id;

  v_capture_remaining := least(v_charge, v_held);
  for v_reservation in
    select gwr.* from public.gateway_wallet_reservations gwr
    where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
      and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%')
    order by gwr.created_at, gwr.reservation_id
    for update
  loop
    v_row_capture := least(v_reservation.amount_nanos, v_capture_remaining);
    update public.gateway_wallet_reservations
    set status = case when v_row_capture > 0 then 'captured' else 'released' end,
        captured_nanos = v_row_capture,
        released_nanos = v_reservation.amount_nanos - v_row_capture,
        capture_ref_id = case when v_row_capture > 0 then p_session_id else null end,
        release_ref_id = case when v_row_capture < v_reservation.amount_nanos then p_session_id else null end,
        captured_at = case when v_row_capture > 0 then now() else null end,
        released_at = case when v_row_capture < v_reservation.amount_nanos then now() else null end,
        updated_at = now()
    where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
    v_capture_remaining := greatest(0, v_capture_remaining - v_row_capture);
  end loop;

  if v_charge > 0 then
    insert into public.credit_ledger (
      workspace_id, event_time, kind, amount_nanos, before_balance_nanos,
      after_balance_nanos, before_reserved_nanos, after_reserved_nanos,
      ref_type, ref_id, created_at, status
    ) values (
      p_workspace_id, now(), 'charge', -v_charge, v_before_balance,
      v_before_balance - v_charge, v_before_reserved, greatest(0, v_before_reserved - v_held),
      'realtime_session', p_session_id, now(), 'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = v_next_status,
      ended_at = coalesce(ended_at, now()),
      final_cost_nanos = v_total,
      captured_nanos = v_prepaid + v_charge,
      released_nanos = greatest(0, v_held - least(v_charge, v_held)),
      reserved_nanos = greatest(coalesce(v_session.reserved_nanos, 0), v_held),
      usage = coalesce(p_usage, '{}'::jsonb),
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end,
      disconnect_reason = nullif(trim(coalesce(p_disconnect_reason, '')), ''),
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      billing_estimated = coalesce(p_estimated, false),
      estimate_basis = case when coalesce(p_estimated, false)
        then left(coalesce(nullif(trim(p_estimate_basis), ''), 'metered_audio'), 120) end,
      debt_nanos = v_debt,
      uncollected_nanos = v_uncollected,
      billing_anomaly = v_anomaly,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  update public.gateway_requests
  set native_response_id = coalesce(v_session.provider_session_id, v_session.provider_native_id),
      status_code = case when v_next_status = 'completed' then 200 else 499 end,
      success = v_next_status = 'completed',
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      generation_ms = greatest(0, floor(extract(epoch from (v_session.ended_at - v_session.started_at)) * 1000))::integer,
      usage = coalesce(p_usage, '{}'::jsonb),
      -- The full priced cost; any uncollected part stays on the session.
      cost_nanos = v_total,
      currency = 'USD',
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;
  get diagnostics v_request_count = row_count;
  if v_request_count <> 1 then
    raise exception 'realtime_request_summary_missing';
  end if;

  return query select true, false, v_session.status, v_total, v_held, v_prepaid + v_charge,
    greatest(0, v_held - least(v_charge, v_held)), v_before_balance,
    v_before_balance - v_charge, v_before_reserved, greatest(0, v_before_reserved - v_held),
    v_debt, v_uncollected;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_mark_billing_unresolved (
  p_workspace_id          uuid,
  p_session_id            text,
  p_usage                 jsonb,
  p_reason                text,
  p_confirmed_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_wallet_found boolean;
  v_held bigint;
  v_capture bigint := 0;
  v_remaining bigint;
  v_row_capture bigint;
  v_captured_total bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
begin
  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  -- Same lock order as settlement: reservations, wallet, session.
  perform 1 from public.gateway_wallet_reservations r
  where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
    and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
  order by r.created_at, r.reservation_id
  for update;
  perform 1 from public.wallets where workspace_id = p_workspace_id for update;
  v_wallet_found := found;
  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id
  for update;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  -- Capture the provider-confirmed portion now, from the session holds, so a
  -- review only has to decide the unconfirmed remainder.
  v_capture := greatest(0, coalesce(p_confirmed_cost_nanos, 0) - coalesce(v_session.captured_nanos, 0));
  if v_capture > 0 and v_wallet_found then
    select coalesce(sum(r.amount_nanos), 0)::bigint into v_held
    from public.gateway_wallet_reservations r
    where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
      and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%');
    select w.balance_nanos, w.reserved_nanos into v_before_balance, v_before_reserved
    from public.wallets w where w.workspace_id = p_workspace_id;
    v_capture := least(v_capture, v_held, greatest(0, coalesce(v_before_reserved, 0)));
  else
    v_capture := 0;
  end if;

  if v_capture > 0 then
    v_captured_total := coalesce(v_session.captured_nanos, 0) + v_capture;
    v_remaining := v_capture;
    for v_reservation in
      select r.* from public.gateway_wallet_reservations r
      where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
        and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
      order by r.created_at, r.reservation_id
      for update
    loop
      exit when v_remaining <= 0;
      v_row_capture := least(v_reservation.amount_nanos, v_remaining);
      if v_row_capture = v_reservation.amount_nanos then
        update public.gateway_wallet_reservations
        set status = 'captured', captured_nanos = v_row_capture, released_nanos = 0,
            capture_ref_id = p_session_id, captured_at = now(), updated_at = now()
        where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
      else
        -- Split the hold: the captured part becomes its own captured row.
        update public.gateway_wallet_reservations
        set amount_nanos = v_reservation.amount_nanos - v_row_capture, updated_at = now()
        where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
        insert into public.gateway_wallet_reservations (
          reservation_id, workspace_id, amount_nanos, status, hold_ref_id, capture_ref_id,
          captured_nanos, released_nanos, captured_at, created_at, updated_at
        ) values (
          v_session.reservation_prefix || 'confirmed:' || v_captured_total::text, p_workspace_id,
          v_row_capture, 'captured', p_session_id, p_session_id, v_row_capture, 0, now(), now(), now()
        );
      end if;
      v_remaining := v_remaining - v_row_capture;
    end loop;

    update public.wallets
    set balance_nanos = balance_nanos - v_capture,
        reserved_nanos = greatest(0, reserved_nanos - v_capture),
        updated_at = now()
    where workspace_id = p_workspace_id;

    insert into public.credit_ledger (
      workspace_id, event_time, kind, amount_nanos, before_balance_nanos,
      after_balance_nanos, before_reserved_nanos, after_reserved_nanos,
      ref_type, ref_id, created_at, status
    ) values (
      p_workspace_id, now(), 'charge', -v_capture, v_before_balance,
      v_before_balance - v_capture, v_before_reserved, greatest(0, v_before_reserved - v_capture),
      'realtime_session', p_session_id || ':confirmed:' || v_captured_total::text, now(), 'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = 'billing_unresolved',
      usage = coalesce(p_usage, '{}'::jsonb),
      captured_nanos = coalesce(captured_nanos, 0) + v_capture,
      disconnect_reason = left(coalesce(nullif(trim(p_reason), ''), 'authoritative_usage_missing'), 240),
      error_code = 'realtime_authoritative_usage_missing',
      last_event_at = now(),
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  update public.gateway_requests
  set status_code = 202,
      success = false,
      error_code = 'realtime_authoritative_usage_missing',
      error_message = 'Realtime billing requires reconciliation.',
      usage = coalesce(p_usage, '{}'::jsonb),
      cost_nanos = v_session.captured_nanos
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;

  return next v_session;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_realtime_review_admission()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.wallets where workspace_id = new.workspace_id for update;
  -- Only the API key whose session is under review is blocked, not the workspace.
  if exists (select 1 from public.gateway_realtime_billing_reviews
    where workspace_id = new.workspace_id and access_blocked
      and key_id is not distinct from new.key_id) then
    raise exception 'realtime_billing_review_required';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.gateway_realtime_review_lifecycle()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.status = 'billing_unresolved' then
    insert into public.gateway_realtime_billing_reviews (session_id, workspace_id, key_id, evidence_usage, evidence_metadata)
    values (new.session_id, new.workspace_id, new.key_id, new.usage, new.metadata) on conflict do nothing;
    if old.usage is distinct from new.usage or old.metadata is distinct from new.metadata then
      update public.gateway_realtime_billing_reviews set confirmed_cost_nanos = null,
        evidence_complete = false, version = version + 1, retry_after = now()
      where session_id = new.session_id and status = 'open';
    end if;
  elsif new.status in ('completed', 'failed', 'cancelled', 'expired') then
    insert into public.gateway_realtime_billing_decisions
      (session_id, workspace_id, action, reason, review_version, cost_nanos)
    select session_id, workspace_id, 'settled', coalesce(new.disconnect_reason, 'server_settlement'),
      version, new.final_cost_nanos
    from public.gateway_realtime_billing_reviews where session_id = new.session_id and status = 'open';
    -- Settling the session resolves its review and restores the key automatically.
    update public.gateway_realtime_billing_reviews set status = 'resolved', resolved_at = now(),
      access_blocked = false, version = version + 1
    where session_id = new.session_id and status = 'open';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.gateway_realtime_review_decide (
  p_session_id       text,
  p_actor_user_id    text,
  p_operation_id     uuid,
  p_expected_version bigint,
  p_action           text,
  p_reason           text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_review public.gateway_realtime_billing_reviews%rowtype;
  v_previous public.gateway_realtime_billing_decisions%rowtype;
  v_settlement record;
  v_cost bigint;
begin
  if not exists (select 1 from public.users where user_id::text = p_actor_user_id and lower(role::text) = 'admin') then
    raise exception 'realtime_review_forbidden';
  end if;
  if p_action is null or p_action not in ('retry', 'retain', 'capture_confirmed', 'write_off', 'restore_access')
    or p_operation_id is null or p_expected_version is null
    or p_reason is null or length(trim(p_reason)) < 10 or length(p_reason) > 1000 then
    raise exception 'realtime_review_invalid_decision';
  end if;
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id;
  if not found then raise exception 'realtime_review_not_found'; end if;
  -- Match the existing settlement lock order: reservations, wallet, session, review.
  perform 1 from public.gateway_wallet_reservations r where r.workspace_id = v_session.workspace_id
    and r.status in ('held', 'reserved') and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
    order by r.created_at, r.reservation_id for update;
  perform 1 from public.wallets where workspace_id = v_session.workspace_id for update;
  select * into v_session from public.gateway_realtime_sessions where session_id = p_session_id for update;
  select * into v_review from public.gateway_realtime_billing_reviews where session_id = p_session_id for update;
  if not found then raise exception 'realtime_review_not_found'; end if;
  select * into v_previous from public.gateway_realtime_billing_decisions where operation_id = p_operation_id;
  if found then
    if v_previous.session_id <> p_session_id or v_previous.actor_user_id is distinct from p_actor_user_id
      or v_previous.action <> p_action or v_previous.reason <> trim(p_reason) then
      raise exception 'realtime_review_idempotency_conflict';
    end if;
    return jsonb_build_object('applied', false, 'already_applied', true);
  end if;
  if v_review.version <> p_expected_version then raise exception 'realtime_review_stale'; end if;
  if p_action = 'restore_access' then
    if v_review.status <> 'resolved' then raise exception 'realtime_review_still_open'; end if;
    update public.gateway_realtime_billing_reviews set access_blocked = false, version = version + 1 where session_id = p_session_id;
  else
    if v_review.status <> 'open' or v_session.status <> 'billing_unresolved' then raise exception 'realtime_review_closed'; end if;
    if p_action in ('retry', 'retain') then
      if p_action = 'retain' and now() >= v_review.opened_at + interval '7 days' then
        raise exception 'realtime_review_retention_limit';
      end if;
      update public.gateway_realtime_billing_reviews set
        retry_after = case when p_action = 'retry' then now() else retry_after end,
        review_due_at = case when p_action = 'retain' then least(now() + interval '1 day', opened_at + interval '7 days') else review_due_at end,
        version = version + 1 where session_id = p_session_id;
    else
      v_cost := 0;
      if p_action = 'capture_confirmed' then
        if v_review.confirmed_cost_nanos is null or v_review.billable_usage is null
          or v_review.evidence_usage is distinct from v_session.usage
          or v_review.evidence_metadata is distinct from v_session.metadata then raise exception 'realtime_review_evidence_missing'; end if;
        v_cost := v_review.confirmed_cost_nanos;
      end if;
      -- Settlement captures beyond the holds within the overdraft cap; no hold cap here.
      if p_action = 'write_off' then
        update public.gateway_realtime_billing_reviews set evidence_usage = v_session.usage, evidence_metadata = v_session.metadata
        where session_id = p_session_id;
      end if;
      select * into v_settlement from public.gateway_realtime_settle_once(v_session.workspace_id, p_session_id,
        v_cost, case when p_action = 'capture_confirmed' then v_review.billable_usage else '{}'::jsonb end,
        case when p_action = 'capture_confirmed' then v_review.pricing_lines else '[]'::jsonb end,
        'failed', 'billing_review_' || p_action, 'billing_review_resolved', null);
      if not coalesce(v_settlement.applied, false) then raise exception 'realtime_review_settlement_failed'; end if;
    end if;
  end if;
  insert into public.gateway_realtime_billing_decisions
    (operation_id, session_id, workspace_id, actor_user_id, action, reason, review_version, cost_nanos)
  values (p_operation_id, p_session_id, v_session.workspace_id, p_actor_user_id, p_action, trim(p_reason), v_review.version, v_cost);
  return jsonb_build_object('applied', true, 'already_applied', false);
end $function$;

CREATE OR REPLACE FUNCTION public.gateway_realtime_enforce_provider_concurrency()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_provider text := lower(trim(coalesce(new.provider, '')));
  v_active_count integer;
begin
  if v_provider = '' then
    raise exception 'realtime_provider_required';
  end if;

  -- Serialize creates for one shared provider account across all workspaces.
  perform pg_advisory_xact_lock(
    hashtextextended('gateway_realtime_provider:' || v_provider, 0)
  );

  select count(*)::integer into v_active_count
  from public.gateway_realtime_sessions
  where lower(provider) = v_provider
    and status in ('created', 'connecting', 'connected', 'ending')
    -- Stuck rows awaiting reconciliation hold no provider connection: never
    -- claimed after 2 minutes, past expiry, or silent past the relay idle and
    -- drain timeouts.
    and not (
      (status = 'created' and created_at < now() - interval '2 minutes')
      or (expires_at is not null and expires_at < now() - interval '1 minute')
      or (status <> 'created'
        and coalesce(last_event_at, connected_at, created_at) < now() - interval '10 minutes')
    );

  if v_active_count >= 20 then
    raise exception 'realtime_provider_concurrency_limit';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gateway_realtime_extend_hold_once_without_workspace_budget (
  p_workspace_id          uuid,
  p_session_id            text,
  p_reservation_id        text,
  p_target_reserved_nanos bigint,
  p_estimated_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_session public.gateway_realtime_sessions%rowtype;
  v_additional bigint;
begin
  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'wallet_not_found'; end if;

  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id
  for update;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status not in ('created', 'connecting', 'connected', 'ending') then
    raise exception 'realtime_session_terminal';
  end if;

  v_additional := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_session.reserved_nanos, 0));
  if v_additional > 0 then
    -- The relay begins the budget close when this raises.
    if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < v_additional then
      raise exception 'insufficient_funds';
    end if;

    insert into public.gateway_wallet_reservations (
      reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
      captured_nanos, released_nanos, created_at, updated_at
    ) values (
      p_reservation_id, p_workspace_id, v_additional, 'reserved', p_session_id,
      0, 0, now(), now()
    );
    update public.wallets
    set reserved_nanos = coalesce(reserved_nanos, 0) + v_additional,
        updated_at = now()
    where workspace_id = p_workspace_id;
  end if;

  update public.gateway_realtime_sessions
  set reservation_count = reservation_count + case when v_additional > 0 then 1 else 0 end,
      reserved_nanos = reserved_nanos + v_additional,
      estimated_cost_nanos = greatest(estimated_cost_nanos, coalesce(p_estimated_cost_nanos, 0)),
      last_event_at = now(), updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return next v_session;
end;
$function$;

