CREATE OR REPLACE FUNCTION public.machine_payment_claim_authorization (
  p_challenge_id              uuid,
  p_protocol                  public.machine_payment_protocol,
  p_mode                      public.machine_payment_mode,
  p_payer_id                  text,
  p_external_authorization_id text,
  p_credential_fingerprint    text,
  p_request_hash              text,
  p_pricing_snapshot_hash     text,
  p_max_amount_nanos          bigint,
  p_expires_at                timestamp with time zone,
  p_request_id                text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_challenge public.machine_payment_challenges; v_auth public.machine_payment_authorizations;
begin
  select * into v_challenge from public.machine_payment_challenges where id = p_challenge_id for update;
  if not found or v_challenge.status <> 'open' or v_challenge.expires_at <= now() then raise exception 'challenge_unavailable'; end if;
  if not (p_protocol = any(v_challenge.allowed_protocols)) then raise exception 'protocol_not_allowed'; end if;
  if v_challenge.request_hash <> p_request_hash or v_challenge.pricing_snapshot_hash <> p_pricing_snapshot_hash then raise exception 'payment_binding_mismatch'; end if;
  if p_max_amount_nanos < v_challenge.amount_nanos or p_expires_at <= now() then raise exception 'authorization_insufficient_or_expired'; end if;
  insert into public.machine_payment_authorizations(challenge_id, protocol, mode, payer_id, external_authorization_id, request_hash, pricing_snapshot_hash, max_amount_nanos, credential_fingerprint, expires_at, claimed_request_id, status, claimed_at)
  values (p_challenge_id, p_protocol, p_mode, p_payer_id, p_external_authorization_id, p_request_hash, p_pricing_snapshot_hash, p_max_amount_nanos, p_credential_fingerprint, least(p_expires_at, v_challenge.expires_at), p_request_id, 'claimed', now()) returning * into v_auth;
  update public.machine_payment_challenges set status = 'authorized', updated_at = now() where id = p_challenge_id;
  insert into public.machine_payment_events(authorization_id, challenge_id, event_type, idempotency_key)
  values (v_auth.id, p_challenge_id, 'authorization.claimed', 'authorization.claimed:' || v_auth.id);
  return jsonb_build_object('kind','machine_payment','protocol',v_auth.protocol,'payerId',v_auth.payer_id,'authorizationId',v_auth.id,'challengeId',v_auth.challenge_id,'requestHash',v_auth.request_hash,'pricingSnapshotHash',v_auth.pricing_snapshot_hash,'maxAmountNanos',v_auth.max_amount_nanos,'currency',v_auth.currency,'mode',v_auth.mode);
exception when unique_violation then raise exception 'payment_replay_detected';
end $function$;

GRANT EXECUTE
  ON FUNCTION "public"."machine_payment_claim_authorization"(uuid, public.machine_payment_protocol, public.machine_payment_mode, text, text, text, text, text, bigint, timestamp
    WITH time zone, text)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."machine_payment_claim_authorization"(uuid, public.machine_payment_protocol, public.machine_payment_mode, text, text, text, text, text, bigint, timestamp
    WITH time zone, text)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."machine_payment_claim_authorization"(uuid, public.machine_payment_protocol, public.machine_payment_mode, text, text, text, text, text, bigint, timestamp
    WITH time zone, text)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."machine_payment_claim_authorization"(uuid, public.machine_payment_protocol, public.machine_payment_mode, text, text, text, text, text, bigint, timestamp
    WITH time zone, text)
  FROM PUBLIC, "anon", "authenticated";
