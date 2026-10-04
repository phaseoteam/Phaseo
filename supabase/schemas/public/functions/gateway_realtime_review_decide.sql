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
  v_held bigint;
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
      select coalesce(sum(amount_nanos), 0) into v_held from public.gateway_wallet_reservations r
      where r.workspace_id = v_session.workspace_id and r.status in ('held', 'reserved')
        and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%');
      if v_cost > v_held then raise exception 'realtime_review_cost_exceeds_hold'; end if;
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

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_decide"(text, text, uuid, bigint, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_decide"(text, text, uuid, bigint, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_review_decide"(text, text, uuid, bigint, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_review_decide"(text, text, uuid, bigint, text, text) FROM PUBLIC, "anon", "authenticated";
