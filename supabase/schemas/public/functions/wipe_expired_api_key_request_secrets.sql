CREATE OR REPLACE FUNCTION public.wipe_expired_api_key_request_secrets ()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Wipes the encrypted secret of every approved key request nobody collected before secret_expires_at
-- (at most 15 minutes after approval) and marks the request expired. Only clears columns; rows are kept.
-- The gateway's 5-minute scheduled cleanup calls it, so no ciphertext outlives its expiry by more than a
-- few minutes even when nobody polls or asks again. Returns the number of secrets wiped.
declare
  v_wiped integer;
begin
  update public.api_key_requests r
  set secret_ciphertext = null, status = 'expired', updated_at = now()
  where r.secret_ciphertext is not null
    and r.secret_expires_at <= now();
  get diagnostics v_wiped = row_count;
  return v_wiped;
end;
$function$;

COMMENT ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() IS 'Clears the encrypted secrets of approved API key requests past secret_expires_at and marks them expired. Called by the gateway scheduled cleanup every 5 minutes. Service role only.';

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."wipe_expired_api_key_request_secrets"() FROM "anon", "authenticated";
