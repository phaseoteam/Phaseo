CREATE OR REPLACE FUNCTION public.create_credit_topup_request (
  p_workspace_id          uuid,
  p_requested_by          uuid,
  p_requested_via         text,
  p_oauth_client_id       text,
  p_flow                  text,
  p_amount_cents          integer,
  p_payment_method_id     text,
  p_payment_method_brand  text,
  p_payment_method_last4  text,
  p_confirm_token_hash    text,
  p_idempotency_key       text,
  p_ttl_seconds           integer DEFAULT 1800,
  p_max_pending           integer DEFAULT 5
)
  RETURNS TABLE (
    request_id uuid,
    created    boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Creates a pending credit top-up request, or returns the earlier one for the same
-- (workspace, idempotency key). Serialised per workspace so the pending cap holds under
-- concurrent calls. Pending requests past their expiry are marked expired first.
declare
  v_existing public.credit_topup_requests%rowtype;
  v_pending integer;
  v_id uuid;
begin
  if p_workspace_id is null or p_amount_cents is null or p_confirm_token_hash is null
    or p_ttl_seconds is null or p_ttl_seconds < 60 or p_ttl_seconds > 86400
    or p_max_pending is null or p_max_pending < 1 or p_max_pending > 100 then
    raise exception 'credit_topup_invalid_arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('credit_topup_requests:' || p_workspace_id::text, 0));

  if p_idempotency_key is not null then
    select * into v_existing
    from public.credit_topup_requests r
    where r.workspace_id = p_workspace_id
      and r.idempotency_key = p_idempotency_key;
    if found then
      if v_existing.amount_cents <> p_amount_cents
        or v_existing.requested_by is distinct from p_requested_by then
        raise exception 'credit_topup_idempotency_conflict' using errcode = '22023';
      end if;
      return query select v_existing.id, false;
      return;
    end if;
  end if;

  update public.credit_topup_requests r
  set status = 'expired', reason = 'expired', updated_at = now()
  where r.workspace_id = p_workspace_id
    and r.status = 'pending'
    and r.expires_at <= now();

  select count(*) into v_pending
  from public.credit_topup_requests r
  where r.workspace_id = p_workspace_id
    and r.status = 'pending';
  if v_pending >= p_max_pending then
    raise exception 'credit_topup_too_many_pending' using errcode = 'P0001';
  end if;

  insert into public.credit_topup_requests (
    workspace_id, requested_by, requested_via, oauth_client_id, flow, amount_cents,
    payment_method_id, payment_method_brand, payment_method_last4,
    confirm_token_hash, idempotency_key, expires_at
  )
  values (
    p_workspace_id, p_requested_by, p_requested_via, p_oauth_client_id, p_flow, p_amount_cents,
    p_payment_method_id, p_payment_method_brand, p_payment_method_last4,
    p_confirm_token_hash, p_idempotency_key, now() + make_interval(secs => p_ttl_seconds)
  )
  returning id into v_id;

  return query select v_id, true;
end;
$function$;

COMMENT ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) IS 'Creates a pending credit top-up request (at most p_max_pending, default 5, pending per workspace), or returns the existing request for the same idempotency key. Service role only.';

REVOKE ALL ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_credit_topup_request"(uuid, uuid, text, text, text, integer, text, text, text, text, text, integer, integer) FROM "anon", "authenticated";
