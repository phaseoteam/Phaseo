-- CLI credit top-ups (billing:write).
-- * Management scope billing:write on the first-party CLI OAuth client's allowlist. It is not a
--   default CLI scope: users opt in with `phaseo login --scopes billing:write`.
-- * public.credit_topup_requests: top-ups started through POST /v1/credits/topups. checkout
--   requests send the requester to Stripe Checkout; saved_card requests wait for a workspace
--   owner or admin to confirm the charge on an emailed, single-use link (30 minutes).
-- * public.create_credit_topup_request (idempotency key, 5 pending per workspace),
--   public.decide_credit_topup_request (confirm/decline; a decline needs the Checkout Session the
--   caller expired, so it cannot race a new session), public.record_credit_topup_payment
--   (webhook outcome, one PaymentIntent per request).
-- * public.rotate_oauth_refresh_token: a refreshed token keeps at most the scopes of the token it
--   replaces, so a later login that opts in to billing:write does not widen older sessions.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

UPDATE public.oauth_clients
SET allowed_scopes = array(
  SELECT DISTINCT scope
  FROM unnest(coalesce(allowed_scopes, '{}'::text[]) || array['billing:write']) scope
  ORDER BY scope
), updated_at = now()
WHERE id = 'phaseo_cli';

CREATE TABLE "public"."credit_topup_requests" (
  "id"                         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id"               uuid                     NOT NULL,
  "requested_by"               uuid,
  "requested_via"              text                     NOT NULL,
  "oauth_client_id"            text,
  "flow"                       text                     NOT NULL,
  "amount_cents"               integer                  NOT NULL,
  "currency"                   text                     DEFAULT 'usd'::text NOT NULL,
  "payment_method_id"          text,
  "payment_method_brand"       text,
  "payment_method_last4"       text,
  "status"                     text                     DEFAULT 'pending'::text NOT NULL,
  "reason"                     text,
  "confirm_token_hash"         text                     NOT NULL,
  "idempotency_key"            text,
  "stripe_payment_intent_id"   text,
  "stripe_checkout_session_id" text,
  "decided_by"                 uuid,
  "decided_at"                 timestamp with time zone,
  "paid_at"                    timestamp with time zone,
  "expires_at"                 timestamp with time zone NOT NULL,
  "created_at"                 timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"                 timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_topup_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "credit_topup_requests_amount_cents_check" CHECK (((amount_cents >= 500) AND (amount_cents <= 50000))),
  CONSTRAINT "credit_topup_requests_currency_check" CHECK ((currency = 'usd'::text)),
  CONSTRAINT "credit_topup_requests_flow_check" CHECK ((flow = ANY (ARRAY['checkout'::text, 'saved_card'::text]))),
  CONSTRAINT "credit_topup_requests_idempotency_key_check" CHECK (((idempotency_key IS NULL) OR ((length(idempotency_key) >= 1) AND (length(idempotency_key) <= 255)))),
  CONSTRAINT "credit_topup_requests_requested_via_check" CHECK ((requested_via = ANY (ARRAY['oauth'::text, 'management_key'::text]))),
  CONSTRAINT "credit_topup_requests_saved_card_check" CHECK (((flow = 'checkout'::text) OR (payment_method_id IS NOT NULL))),
  CONSTRAINT "credit_topup_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'expired'::text, 'paid'::text, 'failed'::text]))),
  CONSTRAINT "credit_topup_requests_stripe_checkout_session_id_key" UNIQUE (stripe_checkout_session_id),
  CONSTRAINT "credit_topup_requests_stripe_payment_intent_id_key" UNIQUE (stripe_payment_intent_id),
  CONSTRAINT "credit_topup_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."credit_topup_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX credit_topup_requests_idempotency_idx ON public.credit_topup_requests USING btree (workspace_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

CREATE INDEX credit_topup_requests_workspace_pending_idx ON public.credit_topup_requests USING btree (workspace_id, expires_at) WHERE (status = 'pending'::text);

CREATE POLICY "deny_direct_client_access" ON "public"."credit_topup_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."credit_topup_requests" IS 'Credit top-ups started from the API or CLI (billing:write). checkout: the requester pays with a new card through Stripe Checkout. saved_card: a workspace owner or admin confirms the charge on an emailed, single-use link. Credits are applied only by the Stripe payment webhook. Service role only.';

COMMENT ON COLUMN "public"."credit_topup_requests"."confirm_token_hash" IS 'SHA-256 hex of the single-use token in the confirm link. The token itself is never stored here.';

COMMENT ON COLUMN "public"."credit_topup_requests"."reason" IS 'Reason code for declined, expired and failed requests (declined, expired, card_declined, authentication_failed, payment_failed, ...).';

REVOKE ALL ON TABLE "public"."credit_topup_requests" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."credit_topup_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."credit_topup_requests" FROM "anon", "authenticated";

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

CREATE OR REPLACE FUNCTION public.rotate_oauth_refresh_token (
  p_current_token_hash text,
  p_next_token_hash    text,
  p_next_expires_at    timestamp with time zone,
  p_scopes             text[]
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
  token_family uuid;
  granted_scopes text[];
begin
  -- Read identity without a row lock. Taking the token lock here would invert
  -- the member-delete trigger's membership -> authorization -> token order.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash;

  if not found then
    return 'invalid';
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  if not found then
    return 'invalid';
  end if;

  select authorization_row.scopes into granted_scopes
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    return 'invalid';
  end if;

  -- Re-read and validate after acquiring locks because another rotation may
  -- have changed this token between the initial identity read and this lock.
  select * into current_token
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash
  for update;

  if not found
    or current_token.user_id <> token_identity.user_id
    or current_token.workspace_id <> token_identity.workspace_id
    or current_token.client_id <> token_identity.client_id then
    return 'invalid';
  end if;

  token_family := coalesce(current_token.family_id, current_token.id);

  if current_token.revoked_at is not null then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = token_family;
    return 'reused';
  end if;

  if current_token.expires_at is not null and current_token.expires_at <= now() then
    update public.oauth_refresh_tokens set revoked_at = now() where id = current_token.id;
    return 'invalid';
  end if;

  -- Never widen a session on refresh: the new token keeps the scopes of the token it replaces
  -- that the authorization still grants. Tokens stored without scopes keep the authorization's
  -- scopes minus opt-in ones (billing:write), which need a new login.
  granted_scopes := case
    when coalesce(cardinality(current_token.scopes), 0) = 0 then array_remove(granted_scopes, 'billing:write')
    else array(
      select scope from unnest(granted_scopes) as scope
      where scope = any(current_token.scopes)
    )
  end;

  update public.oauth_refresh_tokens
  set revoked_at = now(), last_used_at = now()
  where id = current_token.id;

  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at,
    rotated_from, family_id
  ) values (
    p_next_token_hash, current_token.user_id, current_token.workspace_id,
    current_token.client_id, granted_scopes, p_next_expires_at,
    current_token.id, token_family
  );

  return 'rotated';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_refresh_token"(text, text, timestamp WITH time zone, text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rotate_oauth_refresh_token"(text, text, timestamp WITH time zone, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_refresh_token"(text, text, timestamp WITH time zone, text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."rotate_oauth_refresh_token"(text, text, timestamp WITH time zone, text[]) FROM PUBLIC, "anon", "authenticated";
