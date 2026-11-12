CREATE OR REPLACE FUNCTION public.get_api_key_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id                 uuid,
    workspace_id       uuid,
    requested_by       uuid,
    requested_via      text,
    oauth_client_id    text,
    client_name        text,
    agent              text,
    key_name           text,
    daily_cost_nanos   bigint,
    monthly_cost_nanos bigint,
    key_lifetime_days  integer,
    status             text,
    key_id             uuid,
    decided_at         timestamp with time zone,
    expires_at         timestamp with time zone,
    created_at         timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- What the approval page shows. Never the code challenge or the encrypted secret. A request still
  -- waiting after its expiry reads as expired.
  select r.id, r.workspace_id, r.requested_by, r.requested_via, r.oauth_client_id, r.client_name, r.agent, r.key_name,
    r.daily_cost_nanos, r.monthly_cost_nanos, r.key_lifetime_days,
    case when r.status in ('pending', 'approving') and r.expires_at <= now() then 'expired' else r.status end,
    r.key_id, r.decided_at, r.expires_at, r.created_at
  from public.api_key_requests r
  where r.id = p_request_id;
$function$;

COMMENT ON FUNCTION "public"."get_api_key_request"(uuid) IS 'Reads an API key request for the dashboard approval page, without its code challenge or secret. Callers check that the signed-in person made the request. Service role only.';

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_api_key_request"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_api_key_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_api_key_request"(uuid) FROM "anon", "authenticated";
