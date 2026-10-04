CREATE OR REPLACE FUNCTION public.apply_workspace_member_override (
  p_workspace_id                uuid,
  p_user_id                     uuid,
  p_access_role                 text,
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
  select owner_user_id into owner_id from public.workspaces where id=p_workspace_id;
  if owner_id is null then raise exception 'Workspace not found'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then
    raise exception 'Workspace member not found';
  end if;
  if p_user_id=owner_id and (p_access_role is not null or p_department_override_enabled) then
    raise exception 'Workspace owner cannot be overridden';
  end if;
  if p_access_role is not null and p_access_role not in ('member','admin') then raise exception 'Invalid access role'; end if;
  if p_department_override_enabled and p_department_id is not null
     and not exists(select 1 from public.workspace_departments where id=p_department_id and workspace_id=p_workspace_id) then
    raise exception 'Department not found';
  end if;
  select to_jsonb(o) into before_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;

  if p_access_role is null and not p_department_override_enabled then
    delete from public.workspace_member_overrides where workspace_id=p_workspace_id and user_id=p_user_id;
  else
    insert into public.workspace_member_overrides(workspace_id,user_id,access_role,department_override_enabled,department_id,department_position,updated_by)
    values(p_workspace_id,p_user_id,p_access_role,coalesce(p_department_override_enabled,false),
      case when p_department_override_enabled then p_department_id else null end,
      case when p_department_override_enabled then coalesce(p_department_position,'member') else null end,p_actor_user_id)
    on conflict(workspace_id,user_id) do update set access_role=excluded.access_role,
      department_override_enabled=excluded.department_override_enabled,department_id=excluded.department_id,
      department_position=excluded.department_position,updated_by=excluded.updated_by,updated_at=now();
  end if;

  perform public.reconcile_scim_entitlements(p_workspace_id);
	perform set_config('phaseo.entitlement_reconcile','on',true);
	update public.workspace_members wm set role=o.access_role::public.workspace_role
	from public.workspace_member_overrides o
	where wm.workspace_id=p_workspace_id and wm.workspace_id=o.workspace_id and wm.user_id=o.user_id and o.access_role is not null
	  and lower(wm.role::text) is distinct from o.access_role;
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,p_actor_user_id,'manual_override');
  select to_jsonb(o) into after_row from public.workspace_member_overrides o where workspace_id=p_workspace_id and user_id=p_user_id;
  insert into public.workspace_directory_audit_events(workspace_id,actor_user_id,action,target_type,target_id,before_state,after_state,request_id)
  values(p_workspace_id,p_actor_user_id,'workspace.member.override','workspace_member',p_user_id::text,before_row,after_row,p_request_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_override"(uuid, uuid, text, boolean, uuid, text, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_override"(uuid, uuid, text, boolean, uuid, text, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_workspace_member_override"(uuid, uuid, text, boolean, uuid, text, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_workspace_member_override"(uuid, uuid, text, boolean, uuid, text, uuid, text) FROM PUBLIC, "anon", "authenticated";
