CREATE OR REPLACE FUNCTION public.finish_api_key_request_approval (
  p_request_id         uuid,
  p_user_id            uuid,
  p_key_id             uuid,
  p_secret_ciphertext  text,
  p_secret_ttl_seconds integer DEFAULT 600
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Marks a claimed API key request approved with the key created for it, and holds the key's encrypted
-- secret for the requester to collect (at most 15 minutes). False when the request isn't claimed by
-- this person any more.
begin
  if p_request_id is null or p_user_id is null or p_key_id is null or nullif(p_secret_ciphertext, '') is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  update public.api_key_requests r
  set status = 'approved',
      key_id = p_key_id,
      secret_ciphertext = p_secret_ciphertext,
      secret_expires_at = now() + make_interval(secs => least(greatest(coalesce(p_secret_ttl_seconds, 600), 60), 900)),
      updated_at = now()
  where r.id = p_request_id
    and r.requested_by = p_user_id
    and r.decided_by = p_user_id
    and r.status = 'approving';
  return found;
end;
$function$;

COMMENT ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) IS 'Marks a claimed API key request approved and holds the new key''s encrypted secret until the requester collects it or it expires. Service role only.';

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_api_key_request_approval"(uuid, uuid, uuid, text, integer) FROM "anon", "authenticated";
