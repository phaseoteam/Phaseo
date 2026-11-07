CREATE OR REPLACE FUNCTION public.apply_workspace_member_department_override (
  p_workspace_id                uuid,
  p_user_id                     uuid,
  p_department_override_enabled boolean,
  p_department_id               uuid,
  p_department_position         text,
  p_actor_user_id               uuid,
  p_request_id                  text    DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare before_row jsonb; after_row jsonb; owner_id uuid;
begin
  -- Changes only a member's department override. The role override (access_role) is the owner's and is
  -- never written here, so an admin's department change can't restore a role the owner just revoked.
  select owner_user_id into owner_id from public.workspaces where id=p_workspace_id;
  if owner_id is null then raise exception 'Workspace not found'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'Workspace member not found';
  end if;
  if p_user_id=owner_id and p_department_override_enabled then
    raise exception 'Workspace owner cannot be overridden';
  end if;
  if p_department_override_enabled and p_department_id is not null
     and not exists(select 1 from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id) then
    raise exception 'Department not found';
  end if;
  select to_jsonb(o) into before_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;

  insert into public.workspace_member_overrides(workspace_id,user_id,access_role,department_override_enabled,department_id,department_position,updated_by)
  values(p_workspace_id,p_user_id,null,coalesce(p_department_override_enabled,false),
    case when p_department_override_enabled then p_department_id else null end,
    case when p_department_override_enabled then coalesce(p_department_position,'member') else null end,p_actor_user_id)
  on conflict(workspace_id,user_id) do update set
    department_override_enabled=excluded.department_override_enabled,department_id=excluded.department_id,
    department_position=excluded.department_position,updated_by=excluded.updated_by,updated_at=now();
  delete from public.workspace_member_overrides
  where workspace_id=p_workspace_id and user_id=p_user_id and access_role is null and not department_override_enabled;

  perform public.reconcile_scim_entitlements(p_workspace_id);
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'manual_override');
  select to_jsonb(o) into after_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.member.department_override','workspace_member',p_user_id::text,before_row,after_row,p_request_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) TO "service_role";

COMMENT ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) IS 'Changes a workspace member''s department override without touching their role override; for admins, who may manage departments but not roles.';

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_department_override"(uuid, uuid, boolean, uuid, text, uuid, text) FROM PUBLIC, "anon", "authenticated";
