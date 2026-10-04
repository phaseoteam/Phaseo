CREATE OR REPLACE FUNCTION public.gateway_wallet_reserve_once (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_amount_nanos   bigint,
  p_hold_ref_id    text    DEFAULT NULL::text,
  p_key_id         uuid    DEFAULT NULL::uuid,
  p_request_count  integer DEFAULT NULL::integer
)
  RETURNS TABLE (
    ok                    boolean,
    applied               boolean,
    reason                text,
    amount_nanos          bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_budget_status jsonb;
  v_balance_nanos bigint;
  v_reserved_nanos bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  perform 1 from public.workspace_budgets
    where workspace_id = p_workspace_id
    order by interval
    for update;

  if not exists (
    select 1 from public.gateway_wallet_reservations
    where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  ) then
    v_budget_status := public.gateway_workspace_budget_status(p_workspace_id, p_amount_nanos);
    if not coalesce((v_budget_status->>'ok')::boolean, true) then
      return query select false, false, (v_budget_status->>'reason')::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    if p_reservation_id like 'video_hold:%' or p_reservation_id like 'batch_hold:%' then
      select coalesce(wallet.balance_nanos, 0), coalesce(wallet.reserved_nanos, 0)
      into v_balance_nanos, v_reserved_nanos
      from public.wallets wallet
      where wallet.workspace_id = p_workspace_id
      for update;
      if found and v_balance_nanos - v_reserved_nanos < 1000000000 then
        return query select false, false, 'insufficient_funds'::text, p_amount_nanos,
          v_balance_nanos, v_balance_nanos, v_reserved_nanos, v_reserved_nanos;
        return;
      end if;
    end if;
  end if;

  return query
  select * from public.gateway_wallet_reserve_once_without_workspace_budget(
    p_workspace_id, p_reservation_id, p_amount_nanos, p_hold_ref_id, p_key_id, p_request_count
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_reserve_once"(uuid, text, bigint, text, uuid, integer) FROM PUBLIC, "anon", "authenticated";
