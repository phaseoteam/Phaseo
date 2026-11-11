CREATE OR REPLACE FUNCTION public.abort_api_key_request_approval (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Puts a claimed API key request back to pending when its key couldn't be created, so the person can
-- try again before it expires.
begin
  update public.api_key_requests r
  set status = 'pending', decided_by = null, decided_at = null, updated_at = now()
  where r.id = p_request_id
    and r.requested_by = p_user_id
    and r.decided_by = p_user_id
    and r.status = 'approving';
  return found;
end;
$function$;

COMMENT ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) IS 'Returns a claimed API key request to pending after its key could not be created. Service role only.';

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."abort_api_key_request_approval"(uuid, uuid) FROM "anon", "authenticated";
