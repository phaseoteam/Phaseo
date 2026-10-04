CREATE OR REPLACE FUNCTION public.reject_workspace_join_request (
  p_request_id uuid
)
  RETURNS TABLE (
    id           uuid,
    workspace_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_req public.workspace_join_requests%rowtype;
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
    raise exception using errcode = '42501', message = 'Only owners or admins may reject join requests.';
  end if;

  return query
  update public.workspace_join_requests r
     set status = 'denied'::public.join_request_status,
         decided_by = v_user_id,
         decided_at = now()
   where r.id = v_req.id
     and r.status = 'pending'::public.join_request_status
  returning r.id, r.workspace_id;

  if not found then
    raise exception using errcode = '23514', message = 'Request already decided';
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."reject_workspace_join_request"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."reject_workspace_join_request"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reject_workspace_join_request"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_workspace_join_request"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reject_workspace_join_request"(uuid) FROM PUBLIC, "anon";
