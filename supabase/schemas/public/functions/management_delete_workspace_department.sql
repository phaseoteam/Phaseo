CREATE OR REPLACE FUNCTION public.management_delete_workspace_department (
  p_workspace_id  uuid,
  p_department_id uuid,
  p_actor_user_id uuid,
  p_request_id    text DEFAULT NULL::text
)
  RETURNS public.workspace_departments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare deleted public.workspace_departments;
begin
  select * into deleted from public.workspace_departments
  where id=p_department_id and workspace_id=p_workspace_id and source_type='manual' for update;
  if deleted is null then raise exception 'Department not found'; end if;
  -- Deleting the department also deletes its directory group mappings, which can remove or demote the
  -- admins they grant, so that is the owner's call. The department row lock above makes this check
  -- atomic: a new mapping's foreign-key check needs a key-share lock on that row, so it waits.
  if exists (
    select 1 from public.scim_group_mappings m where m.workspace_id=p_workspace_id and m.department_id=p_department_id
  ) and not exists (
    select 1 from public.workspaces w where w.id=p_workspace_id and w.owner_user_id=p_actor_user_id
  ) then
    raise exception using errcode='42501', message='department_has_group_mappings',
      detail='Only the workspace owner can delete a department that directory group mappings use.';
  end if;
  delete from public.workspace_department_grants where workspace_id=p_workspace_id and department_id=p_department_id;
  update public.workspace_member_overrides set
    department_override_enabled=false, department_id=null, department_position=null, updated_at=now()
  where workspace_id=p_workspace_id and department_id=p_department_id;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'department_deleted');
  delete from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id returning * into deleted;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.department.delete','workspace_department',p_department_id::text,to_jsonb(deleted),p_request_id);
  return deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."management_delete_workspace_department"(uuid, uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."management_delete_workspace_department"(uuid, uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."management_delete_workspace_department"(uuid, uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."management_delete_workspace_department"(uuid, uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";
