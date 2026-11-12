CREATE OR REPLACE FUNCTION public.machine_payment_settle_once (
  p_authorization_id    uuid,
  p_request_id          text,
  p_actual_amount_nanos bigint,
  p_usage               jsonb   DEFAULT NULL::jsonb,
  p_provider            text    DEFAULT NULL::text,
  p_receipt             jsonb   DEFAULT NULL::jsonb,
  p_release             boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_auth public.machine_payment_authorizations; v_settlement public.machine_payment_settlements;
begin
  select * into v_auth from public.machine_payment_authorizations where id = p_authorization_id for update;
  if not found or v_auth.claimed_request_id <> p_request_id then raise exception 'authorization_not_claimed_for_request'; end if;
  if v_auth.status in ('settled','released') then
    select * into v_settlement from public.machine_payment_settlements where authorization_id = v_auth.id;
    return jsonb_build_object('idempotent',true,'authorization_id',v_auth.id,'status',v_auth.status,'actual_amount_nanos',coalesce(v_settlement.actual_amount_nanos,0),'receipt',v_settlement.receipt);
  end if;
  if p_actual_amount_nanos < 0 or p_actual_amount_nanos > v_auth.max_amount_nanos then raise exception 'settlement_exceeds_authorization'; end if;
  insert into public.machine_payment_settlements(authorization_id, request_id, actual_amount_nanos, provider, usage, receipt)
  values (v_auth.id, p_request_id, case when p_release then 0 else p_actual_amount_nanos end, p_provider, p_usage, p_receipt) returning * into v_settlement;
  update public.machine_payment_authorizations
  set status = (case when p_release then 'released' else 'settled' end)::public.machine_payment_authorization_status,
      settled_at = now()
  where id = v_auth.id;
  insert into public.machine_payment_events(authorization_id, challenge_id, event_type, idempotency_key, payload)
  values (v_auth.id, v_auth.challenge_id, case when p_release then 'authorization.released' else 'authorization.settled' end, 'authorization.finalized:' || v_auth.id, jsonb_build_object('actual_amount_nanos',v_settlement.actual_amount_nanos));
  return jsonb_build_object('idempotent',false,'authorization_id',v_auth.id,'status',case when p_release then 'released' else 'settled' end,'actual_amount_nanos',v_settlement.actual_amount_nanos);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."machine_payment_settle_once"(uuid, text, bigint, jsonb, text, jsonb, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."machine_payment_settle_once"(uuid, text, bigint, jsonb, text, jsonb, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."machine_payment_settle_once"(uuid, text, bigint, jsonb, text, jsonb, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."machine_payment_settle_once"(uuid, text, bigint, jsonb, text, jsonb, boolean) FROM PUBLIC, "anon", "authenticated";
