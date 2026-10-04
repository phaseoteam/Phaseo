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
