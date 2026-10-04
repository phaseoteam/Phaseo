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
  if v_session.status not in ('created', 'connected', 'ending') then
    raise exception 'realtime_session_terminal';
  end if;

  v_additional := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_session.reserved_nanos, 0));
  if v_additional > 0 then
    if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < v_additional then
      update public.gateway_realtime_sessions
      set status = 'ending', disconnect_reason = 'credit_hold_extension_failed',
          error_code = 'insufficient_funds', updated_at = now()
      where id = v_session.id;
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

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once_without_workspace_budget"(uuid, text, text, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once_without_workspace_budget"(uuid, text, text, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_extend_hold_once_without_workspace_budget"(uuid, text, text, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_extend_hold_once_without_workspace_budget"(uuid, text, text, bigint, bigint) FROM PUBLIC, "anon", "authenticated";
