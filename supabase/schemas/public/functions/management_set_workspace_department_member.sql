CREATE OR REPLACE FUNCTION public.management_set_workspace_department_member (
  p_workspace_id  uuid,
  p_department_id uuid,
  p_user_id       uuid,
  p_position      text,
  p_primary       boolean,
  p_actor_user_id uuid,
  p_request_id    text    DEFAULT NULL::text
)
  RETURNS public.workspace_department_grants
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare saved public.workspace_department_grants;
begin
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'Workspace member not found';
  end if;
  if not exists(select 1 from public.workspace_departments where workspace_id=p_workspace_id and id=p_department_id) then
    raise exception 'Department not found';
  end if;
  if p_position not in ('member','lead') then raise exception 'Invalid department position'; end if;
  if p_primary then
    update public.workspace_department_grants set is_primary=false,updated_at=now()
    where workspace_id=p_workspace_id and user_id=p_user_id and source_type='manual';
  end if;
  insert into public.workspace_department_grants(
    workspace_id,user_id,department_id,source_type,source_id,position,is_primary,updated_at
  ) values (
    p_workspace_id,p_user_id,p_department_id,'manual',p_user_id,p_position,coalesce(p_primary,false),now()
  ) on conflict(workspace_id,user_id,department_id,source_type,source_id) do update set
    position=excluded.position,is_primary=excluded.is_primary,updated_at=excluded.updated_at
  returning * into saved;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'department_membership_updated');
  return saved;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."management_set_workspace_department_member"(uuid, uuid, uuid, text, boolean, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."management_set_workspace_department_member"(uuid, uuid, uuid, text, boolean, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."management_set_workspace_department_member"(uuid, uuid, uuid, text, boolean, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."management_set_workspace_department_member"(uuid, uuid, uuid, text, boolean, uuid, text) FROM PUBLIC, "anon", "authenticated";
