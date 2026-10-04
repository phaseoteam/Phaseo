CREATE OR REPLACE FUNCTION public.management_decide_workspace_join_request (
  p_workspace_id  uuid,
  p_request_id    uuid,
  p_decision      text,
  p_actor_user_id uuid
)
  RETURNS TABLE (
    id                uuid,
    workspace_id      uuid,
    requester_user_id uuid,
    invite_id         uuid,
    status            public.join_request_status,
    decided_at        timestamp with time zone,
    decided_by        uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_request public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
  v_status public.join_request_status;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '23514', message = 'Decision actor is required';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception using errcode = '23514', message = 'Decision must be approve or reject';
  end if;

  select * into v_request
  from public.workspace_join_requests request
  where request.id = p_request_id
    and request.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Join request not found';
  end if;
  if v_request.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Join request already decided';
  end if;

  if p_decision = 'approve' then
    if v_request.invite_id is not null then
      update public.workspace_invites invite
      set uses_count = coalesce(invite.uses_count, 0) + 1
      where invite.id = v_request.invite_id
        and invite.workspace_id = p_workspace_id
        and (invite.expires_at is null or invite.expires_at > now())
        and (invite.max_uses is null or coalesce(invite.uses_count, 0) < invite.max_uses)
      returning invite.role into v_role;
      if not found then
        raise exception using errcode = '23514', message = 'Invite is no longer valid';
      end if;
    end if;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, v_request.requester_user_id, v_role)
    on conflict (workspace_id, user_id) do nothing;
    v_status := 'approved'::public.join_request_status;
  else
    v_status := 'denied'::public.join_request_status;
  end if;

  return query
  update public.workspace_join_requests request
  set status = v_status,
      decided_by = p_actor_user_id,
      decided_at = now()
  where request.id = v_request.id
    and request.status = 'pending'::public.join_request_status
  returning request.id, request.workspace_id, request.requester_user_id,
    request.invite_id, request.status, request.decided_at, request.decided_by;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid) IS 'Atomically approves or rejects a workspace join request for the management API service role.';

REVOKE ALL ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."management_decide_workspace_join_request"(uuid, uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";
