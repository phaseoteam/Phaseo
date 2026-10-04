CREATE OR REPLACE FUNCTION public.approve_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id                uuid,
    workspace_id      uuid,
    requester_user_id uuid,
    invite_id         uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
  v_role public.workspace_role := 'member'::public.workspace_role;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized';
  end if;

  select *
    into v_req
  from public.workspace_join_requests
  where workspace_join_requests.id = p_request_id
    and public.is_workspace_admin(workspace_join_requests.workspace_id)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Join request not found or not authorized';
  end if;

  if v_req.status <> 'pending'::public.join_request_status then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;

  if not public.is_workspace_admin(v_req.workspace_id) then
    raise exception using errcode = '42501', message = 'Only owners or admins may approve join requests.';
  end if;

  if v_req.invite_id is not null then
    update public.workspace_invites ti
      set uses_count = coalesce(ti.uses_count, 0) + 1
    where ti.id = v_req.invite_id
      and ti.workspace_id = v_req.workspace_id
      and (ti.expires_at is null or ti.expires_at > now())
      and (ti.max_uses is null or coalesce(ti.uses_count, 0) < ti.max_uses)
    returning ti.role into v_role;

    if not found then
      raise exception using errcode = '23514', message = 'Invite is invalid for this request';
    end if;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_req.workspace_id, v_req.requester_user_id, v_role)
  on conflict on constraint workspace_members_pkey do nothing;

  return query
  update public.workspace_join_requests r
     set status = 'approved'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id, r.requester_user_id, r.invite_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."approve_workspace_join_request"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."approve_workspace_join_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."approve_workspace_join_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."approve_workspace_join_request"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."approve_workspace_join_request"(uuid) FROM PUBLIC, "anon";
