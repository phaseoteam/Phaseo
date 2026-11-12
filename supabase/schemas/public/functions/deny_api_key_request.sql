CREATE OR REPLACE FUNCTION public.deny_api_key_request (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The person who made an API key request turns it down. Nothing is created. Returns the request's
-- status afterwards: denied, or the status it already had if it wasn't pending.
declare
  v_request public.api_key_requests%rowtype;
begin
  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.requested_by <> p_user_id then
    raise exception 'api_key_request_not_found' using errcode = 'P0002';
  end if;

  if v_request.status in ('pending', 'approving') and v_request.expires_at <= now() then
    update public.api_key_requests r set status = 'expired', updated_at = now() where r.id = v_request.id;
    return 'expired';
  end if;

  if v_request.status <> 'pending' then
    return v_request.status;
  end if;

  update public.api_key_requests r
  set status = 'denied', decided_by = p_user_id, decided_at = now(), updated_at = now()
  where r.id = v_request.id;
  return 'denied';
end;
$function$;

COMMENT ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) IS 'Denies a pending API key request for the person who made it. Creates nothing. Service role only.';

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deny_api_key_request"(uuid, uuid) FROM "anon", "authenticated";
