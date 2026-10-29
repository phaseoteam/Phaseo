CREATE OR REPLACE FUNCTION public.record_credit_topup_payment (
  p_request_id        uuid,
  p_workspace_id      uuid,
  p_payment_intent_id text,
  p_outcome           text,
  p_reason            text DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records the Stripe outcome of a credit top-up request. A request belongs to one
-- PaymentIntent: the first one recorded wins and any other is refused (false).
-- paid is final and may follow any other status, since money was taken (a Checkout
-- payment can land after the request expired). failed only follows pending or confirmed.
-- Repeating the same outcome for the same PaymentIntent returns true without changes.
-- Crediting is separate: the webhook credits each PaymentIntent once
-- (public.stripe_apply_payment_intent_credit).
declare
  v_request public.credit_topup_requests%rowtype;
begin
  if p_request_id is null or p_workspace_id is null or p_payment_intent_id is null
    or p_outcome is null or p_outcome not in ('paid', 'failed') then
    raise exception 'credit_topup_invalid_arguments' using errcode = '22023';
  end if;

  select * into v_request
  from public.credit_topup_requests r
  where r.id = p_request_id
    and r.workspace_id = p_workspace_id
  for update;
  if not found then
    return false;
  end if;
  if v_request.stripe_payment_intent_id is not null
    and v_request.stripe_payment_intent_id <> p_payment_intent_id then
    return false;
  end if;

  if p_outcome = 'paid' then
    if v_request.status <> 'paid' then
      update public.credit_topup_requests r
      set status = 'paid', reason = null, paid_at = now(),
          stripe_payment_intent_id = p_payment_intent_id, updated_at = now()
      where r.id = v_request.id;
    end if;
    return true;
  end if;

  if v_request.status = 'failed' then
    return true;
  end if;
  if v_request.status not in ('pending', 'confirmed') then
    return false;
  end if;
  update public.credit_topup_requests r
  set status = 'failed', reason = coalesce(nullif(left(p_reason, 64), ''), 'payment_failed'),
      stripe_payment_intent_id = p_payment_intent_id, updated_at = now()
  where r.id = v_request.id;
  return true;
end;
$function$;

COMMENT ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) IS 'Marks a credit top-up request paid or failed for its single Stripe PaymentIntent. Called by the payment webhook and the confirm route. Service role only.';

REVOKE ALL ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_credit_topup_payment"(uuid, uuid, text, text, text) FROM "anon", "authenticated";
