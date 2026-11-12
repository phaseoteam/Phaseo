CREATE OR REPLACE FUNCTION public.create_workspace_department (
  p_workspace_id  uuid,
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
declare created public.workspace_departments;
begin
  insert into public.workspace_departments(workspace_id,name,icon,color,source_type)
  values(p_workspace_id,btrim(p_name),p_icon,p_color,'manual') returning * into created;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.department.create','workspace_department',created.id::text,to_jsonb(created),p_request_id);
  return created;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_workspace_department"(uuid, text, text, text, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_workspace_department"(uuid, text, text, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_workspace_department"(uuid, text, text, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_workspace_department"(uuid, text, text, text, uuid, text) FROM PUBLIC, "anon", "authenticated";
