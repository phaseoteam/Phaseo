CREATE OR REPLACE FUNCTION public.begin_api_key_request_approval (
  p_request_id uuid,
  p_user_id    uuid
)
  RETURNS TABLE (
    status             text,
    changed            boolean,
    workspace_id       uuid,
    key_name           text,
    daily_cost_nanos   bigint,
    monthly_cost_nanos bigint,
    key_lifetime_days  integer
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Claims a pending API key request for approval, so two approvals can't both create a key. Only the
-- person who made the request may approve it, and only while they are an owner or admin of its
-- workspace. Returns exactly the stored name, limits and lifetime the key must be created with.
-- The caller creates the key, then calls finish_api_key_request_approval, or
-- abort_api_key_request_approval if it couldn't.
declare
  v_request public.api_key_requests%rowtype;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'api_key_request_invalid_arguments' using errcode = '22023';
  end if;

  select * into v_request
  from public.api_key_requests r
  where r.id = p_request_id
  for update;
  if not found or v_request.requested_by <> p_user_id then
    raise exception 'api_key_request_not_found' using errcode = 'P0002';
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
    raise exception 'api_key_request_forbidden' using errcode = '42501';
  end if;

  if v_request.status in ('pending', 'approving') and v_request.expires_at <= now() then
    update public.api_key_requests r
    set status = 'expired', updated_at = now()
    where r.id = v_request.id;
    return query select 'expired'::text, false, v_request.workspace_id, v_request.key_name,
      v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
    return;
  end if;

  if v_request.status <> 'pending' then
    return query select v_request.status, false, v_request.workspace_id, v_request.key_name,
      v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
    return;
  end if;

  update public.api_key_requests r
  set status = 'approving', decided_by = p_user_id, decided_at = now(), updated_at = now()
  where r.id = v_request.id;

  return query select 'approving'::text, true, v_request.workspace_id, v_request.key_name,
    v_request.daily_cost_nanos, v_request.monthly_cost_nanos, v_request.key_lifetime_days;
end;
$function$;

COMMENT ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) IS 'Claims a pending API key request for approval by the person who made it, while they are a workspace owner or admin, and returns the stored key name, limits and lifetime. Service role only.';

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."begin_api_key_request_approval"(uuid, uuid) FROM "anon", "authenticated";
