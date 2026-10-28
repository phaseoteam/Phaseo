CREATE OR REPLACE FUNCTION public.decide_credit_topup_request (
  p_request_id         uuid,
  p_confirm_token_hash text,
  p_user_id            uuid,
  p_decision           text,
  p_expected_checkout_session_id text DEFAULT NULL::text
)
  RETURNS TABLE (
    status  text,
    reason  text,
    changed boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records a workspace owner's or admin's answer to a credit top-up request. Needs the
-- confirm link's token and an owner or admin of the request's workspace. Only a pending,
-- unexpired request changes: confirm -> confirmed, decline -> declined. Asking again
-- returns the current status with changed = false, so a confirmed request can resume its
-- payment (for example after 3D Secure) without being confirmed twice.
-- A decline only commits while the request's Checkout Session is the one the caller saw and
-- expired (p_expected_checkout_session_id; NULL when it saw none). If checkout attached a
-- session in the meantime it raises credit_topup_checkout_changed, so the caller expires that
-- session and declines again. A declined request never keeps a payable session.
declare
  v_request public.credit_topup_requests%rowtype;
begin
  if p_request_id is null or p_confirm_token_hash is null or p_user_id is null
    or p_decision is null or p_decision not in ('confirm', 'decline') then
    raise exception 'credit_topup_invalid_arguments' using errcode = '22023';
  end if;

  select * into v_request
  from public.credit_topup_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.confirm_token_hash <> p_confirm_token_hash then
    raise exception 'credit_topup_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_request.workspace_id
      and m.user_id = p_user_id
      and m.role::text in ('owner', 'admin')
  ) and not exists (
    select 1 from public.workspaces w
    where w.id = v_request.workspace_id
      and w.owner_user_id = p_user_id
  ) then
    raise exception 'credit_topup_forbidden' using errcode = '42501';
  end if;

  if v_request.status = 'pending' and v_request.expires_at <= now() then
    update public.credit_topup_requests r
    set status = 'expired', reason = 'expired', updated_at = now()
    where r.id = v_request.id;
    return query select 'expired'::text, 'expired'::text, true;
    return;
  end if;

  if v_request.status <> 'pending' then
    return query select v_request.status, v_request.reason, false;
    return;
  end if;

  if p_decision = 'decline'
    and v_request.stripe_checkout_session_id is distinct from p_expected_checkout_session_id then
    raise exception 'credit_topup_checkout_changed' using errcode = '40001';
  end if;

  update public.credit_topup_requests r
  set status = case when p_decision = 'confirm' then 'confirmed' else 'declined' end,
      reason = case when p_decision = 'confirm' then null else 'declined' end,
      decided_by = p_user_id,
      decided_at = now(),
      updated_at = now()
  where r.id = v_request.id;

  return query select
    case when p_decision = 'confirm' then 'confirmed' else 'declined' end,
    case when p_decision = 'confirm' then null else 'declined' end,
    true;
end;
$function$;

COMMENT ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) IS 'Confirms or declines a pending credit top-up request for a workspace owner or admin holding the confirm link token. Service role only.';

REVOKE ALL ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."decide_credit_topup_request"(uuid, text, uuid, text, text) FROM "anon", "authenticated";
