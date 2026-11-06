CREATE OR REPLACE FUNCTION public.collect_api_key_request (
  p_request_id          uuid,
  p_user_id             uuid,
  p_code_challenge      text,
  p_min_poll_seconds    integer DEFAULT 2,
  p_max_failed_attempts integer DEFAULT 5
)
  RETURNS TABLE (
    outcome           text,
    workspace_id      uuid,
    key_id            uuid,
    secret_ciphertext text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The requester polls for its API key. Only the person who made the request, holding the verifier
-- of its code challenge, gets the key's encrypted secret, once: it is wiped as it is returned.
-- Outcomes: not_found (no such request for this person), slow_down (polled again within
-- p_min_poll_seconds), invalid_verifier (after p_max_failed_attempts the request is denied and any
-- secret wiped), pending, approved (with the secret), collected (already picked up), denied, expired.
declare
  v_request public.api_key_requests%rowtype;
  v_failed integer;
begin
  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.requested_by is distinct from p_user_id then
    return query select 'not_found'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.last_polled_at is not null
    and v_request.last_polled_at > now() - make_interval(secs => greatest(coalesce(p_min_poll_seconds, 2), 0)) then
    return query select 'slow_down'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if p_code_challenge is null or v_request.code_challenge <> p_code_challenge then
    v_failed := v_request.failed_verifier_attempts + 1;
    update public.api_key_requests r
    set last_polled_at = now(),
        failed_verifier_attempts = v_failed,
        status = case
          when v_failed >= greatest(coalesce(p_max_failed_attempts, 5), 1) and r.status in ('pending', 'approving', 'approved') then 'denied'
          else r.status
        end,
        secret_ciphertext = case when v_failed >= greatest(coalesce(p_max_failed_attempts, 5), 1) then null else r.secret_ciphertext end,
        updated_at = now()
    where r.id = v_request.id;
    return query select 'invalid_verifier'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.status in ('pending', 'approving') then
    if v_request.expires_at <= now() then
      update public.api_key_requests r set status = 'expired', last_polled_at = now(), updated_at = now() where r.id = v_request.id;
      return query select 'expired'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
    update public.api_key_requests r set last_polled_at = now() where r.id = v_request.id;
    return query select 'pending'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.status = 'approved' then
    if v_request.secret_ciphertext is null or v_request.secret_expires_at <= now() then
      update public.api_key_requests r
      set status = 'expired', secret_ciphertext = null, last_polled_at = now(), updated_at = now()
      where r.id = v_request.id;
      return query select 'expired'::text, null::uuid, null::uuid, null::text;
      return;
    end if;
    update public.api_key_requests r
    set status = 'collected', secret_ciphertext = null, collected_at = now(), last_polled_at = now(), updated_at = now()
    where r.id = v_request.id;
    return query select 'approved'::text, v_request.workspace_id, v_request.key_id, v_request.secret_ciphertext;
    return;
  end if;

  update public.api_key_requests r set last_polled_at = now() where r.id = v_request.id;
  return query select v_request.status, null::uuid, null::uuid, null::text;
end;
$function$;

COMMENT ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) IS 'Returns an approved API key''s encrypted secret once, to the person who requested it and holds the PKCE verifier, and wipes it; otherwise the request''s status. Rate-limits polling and denies the request after repeated wrong verifiers. Service role only.';

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."collect_api_key_request"(uuid, uuid, text, integer, integer) FROM "anon", "authenticated";
