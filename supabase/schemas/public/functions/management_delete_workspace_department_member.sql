CREATE OR REPLACE FUNCTION public.management_delete_workspace_department_member (
  p_workspace_id  uuid,
  p_department_id uuid,
  p_user_id       uuid,
  p_actor_user_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.workspace_department_grants
  where workspace_id=p_workspace_id and department_id=p_department_id and user_id=p_user_id and source_type='manual';
  if not found then return false; end if;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'department_membership_deleted');
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."management_delete_workspace_department_member"(uuid, uuid, uuid, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."management_delete_workspace_department_member"(uuid, uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."management_delete_workspace_department_member"(uuid, uuid, uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."management_delete_workspace_department_member"(uuid, uuid, uuid, uuid) FROM PUBLIC, "anon", "authenticated";
