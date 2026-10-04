CREATE OR REPLACE FUNCTION public.update_workspace_department (
  p_workspace_id  uuid,
  p_department_id uuid,
  p_name          text,
  p_icon          text,
  p_color         text,
  p_actor_user_id uuid,
  p_request_id    text DEFAULT NULL::text
)
  RETURNS public.workspace_departments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare before_row public.workspace_departments; updated public.workspace_departments;
begin
  select * into before_row from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id for update;
  if before_row is null then raise exception 'Department not found'; end if;
  update public.workspace_departments set name=btrim(p_name),icon=p_icon,color=p_color,
    name_overridden=case when source_type='scim_group' and btrim(p_name) is distinct from directory_name then true else name_overridden end,
    updated_at=now()
  where id=p_department_id and workspace_id=p_workspace_id returning * into updated;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'department_updated');
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.department.update','workspace_department',p_department_id::text,to_jsonb(before_row),to_jsonb(updated),p_request_id);
  return updated;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_workspace_department"(uuid, uuid, text, text, text, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_workspace_department"(uuid, uuid, text, text, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_workspace_department"(uuid, uuid, text, text, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_workspace_department"(uuid, uuid, text, text, text, uuid, text) FROM PUBLIC, "anon", "authenticated";
