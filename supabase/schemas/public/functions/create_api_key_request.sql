CREATE OR REPLACE FUNCTION public.create_api_key_request (
  p_workspace_id       uuid,
  p_user_id            uuid,
  p_requested_via      text,
  p_oauth_client_id    text,
  p_client_name        text,
  p_agent              text,
  p_key_name           text,
  p_daily_cost_nanos   bigint,
  p_monthly_cost_nanos bigint,
  p_key_lifetime_days  integer,
  p_code_challenge     text,
  p_requester_credential   text,
  p_requester_workspace_id uuid,
  p_ttl_seconds        integer DEFAULT 600,
  p_max_open           integer DEFAULT 5
)
  RETURNS TABLE (
    id         uuid,
    expires_at timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records a pending request for an API key that the person approves in the dashboard. Nothing is
-- created here: the key exists only once the requester approves it there. The requester must be an
-- owner or admin of the workspace (the role that creates keys in the dashboard), and may have at most
-- p_max_open requests waiting in it. Pickup must later come from the same credential (p_requester_credential)
-- and token workspace (p_requester_workspace_id). Secrets of approved requests nobody collected in time are wiped.
declare
  v_id uuid;
  v_expires_at timestamptz := now() + make_interval(secs => least(greatest(coalesce(p_ttl_seconds, 600), 60), 900));
begin
  if p_workspace_id is null or p_user_id is null or p_code_challenge is null
    or nullif(btrim(p_requester_credential), '') is null or p_requester_workspace_id is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role::text in ('owner', 'admin')
  ) and not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = p_user_id
  ) then
    raise exception 'api_key_request_forbidden' using errcode = '42501';
  end if;

  perform public.wipe_expired_api_key_request_secrets();

  update public.api_key_requests r
  set status = 'expired', updated_at = now()
  where r.requested_by = p_user_id
    and r.status in ('pending', 'approving')
    and r.expires_at <= now();

  perform 1 from public.workspaces w where w.id = p_workspace_id for update;
  if (
    select count(*) from public.api_key_requests r
    where r.requested_by = p_user_id
      and r.workspace_id = p_workspace_id
      and r.status in ('pending', 'approving')
      and r.expires_at > now()
  ) >= greatest(coalesce(p_max_open, 5), 1) then
    raise exception 'api_key_request_limit' using errcode = '54000';
  end if;

  insert into public.api_key_requests (
    workspace_id, requested_by, requested_via, oauth_client_id, client_name, agent, key_name,
    daily_cost_nanos, monthly_cost_nanos, key_lifetime_days, code_challenge, requester_credential,
    requester_workspace_id, expires_at
  ) values (
    p_workspace_id, p_user_id, p_requested_via, nullif(btrim(p_oauth_client_id), ''), btrim(p_client_name),
    nullif(btrim(p_agent), ''), btrim(p_key_name), coalesce(p_daily_cost_nanos, 0), coalesce(p_monthly_cost_nanos, 0),
    p_key_lifetime_days, p_code_challenge, btrim(p_requester_credential), p_requester_workspace_id, v_expires_at
  )
  returning api_key_requests.id into v_id;

  return query select v_id, v_expires_at;
end;
$function$;

COMMENT ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) IS 'Records a pending API key request for a workspace owner or admin to approve in the dashboard (at most p_max_open waiting per person and workspace). Creates no key. Service role only.';

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_api_key_request"(uuid, uuid, text, text, text, text, text, bigint, bigint, integer, text, text, uuid, integer, integer) FROM "anon", "authenticated";
