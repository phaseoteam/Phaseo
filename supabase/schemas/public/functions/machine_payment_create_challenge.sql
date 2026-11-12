CREATE OR REPLACE FUNCTION public.machine_payment_create_challenge (
  p_request_hash          text,
  p_pricing_snapshot_hash text,
  p_endpoint              text,
  p_model                 text,
  p_amount_nanos          bigint,
  p_allowed_protocols     public.machine_payment_protocol[],
  p_expires_at            timestamp with time zone,
  p_metadata              jsonb                             DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_row public.machine_payment_challenges;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '15 minutes' then raise exception 'invalid_challenge_expiry'; end if;
  if p_amount_nanos <= 0 or coalesce(array_length(p_allowed_protocols, 1), 0) = 0 then raise exception 'invalid_challenge'; end if;
  insert into public.machine_payment_challenges(request_hash, pricing_snapshot_hash, endpoint, model, amount_nanos, allowed_protocols, expires_at, metadata)
  values (p_request_hash, p_pricing_snapshot_hash, p_endpoint, p_model, p_amount_nanos, p_allowed_protocols, p_expires_at, coalesce(p_metadata, '{}'::jsonb)) returning * into v_row;
  insert into public.machine_payment_events(challenge_id, event_type, idempotency_key, payload)
  values (v_row.id, 'challenge.created', 'challenge.created:' || v_row.id, jsonb_build_object('amount_nanos', v_row.amount_nanos));
  return to_jsonb(v_row);
end $function$;

GRANT EXECUTE
  ON FUNCTION "public"."machine_payment_create_challenge"(text, text, text, text, bigint, public.machine_payment_protocol[], timestamp WITH time zone, jsonb)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."machine_payment_create_challenge"(text, text, text, text, bigint, public.machine_payment_protocol[], timestamp WITH time zone, jsonb)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."machine_payment_create_challenge"(text, text, text, text, bigint, public.machine_payment_protocol[], timestamp WITH time zone, jsonb)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."machine_payment_create_challenge"(text, text, text, text, bigint, public.machine_payment_protocol[], timestamp WITH time zone, jsonb)
  FROM PUBLIC, "anon", "authenticated";
