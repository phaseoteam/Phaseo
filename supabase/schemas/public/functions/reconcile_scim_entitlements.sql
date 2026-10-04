CREATE OR REPLACE FUNCTION public.reconcile_scim_entitlements (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  owner_id uuid;
  previous_reconcile_setting text;
begin
  previous_reconcile_setting := current_setting('phaseo.entitlement_reconcile',true);
  select owner_user_id into owner_id from public.workspaces where id=p_workspace_id;
  delete from public.workspace_access_grants where workspace_id=p_workspace_id and source_type='scim_group';
  insert into public.workspace_access_grants(workspace_id,user_id,source_type,source_id,access_role)
  select distinct m.workspace_id,u.auth_user_id,'scim_group',m.id,m.access_role
  from public.scim_group_mappings m join public.scim_group_members gm on gm.group_id=m.scim_group_id and gm.workspace_id=m.workspace_id
  join public.scim_users u on u.id=gm.user_id and u.workspace_id=m.workspace_id
  where m.workspace_id=p_workspace_id and u.active and u.auth_user_id is not null;
  delete from public.workspace_department_grants where workspace_id=p_workspace_id and source_type='scim_group';
  insert into public.workspace_department_grants(workspace_id,user_id,department_id,source_type,source_id,position,is_primary)
  select distinct m.workspace_id,u.auth_user_id,m.department_id,'scim_group',m.id,m.department_position,false
  from public.scim_group_mappings m join public.scim_group_members gm on gm.group_id=m.scim_group_id and gm.workspace_id=m.workspace_id
  join public.scim_users u on u.id=gm.user_id and u.workspace_id=m.workspace_id
  where m.workspace_id=p_workspace_id and u.active and u.auth_user_id is not null;
  update public.workspace_department_grants g set is_primary=true,updated_at=now()
  from public.scim_users u,public.workspace_departments d
  where g.workspace_id=p_workspace_id and g.source_type='scim_group' and g.user_id=u.auth_user_id
    and u.workspace_id=g.workspace_id and u.active and d.id=g.department_id and d.workspace_id=g.workspace_id
    and u.department is not null and d.name_normalized=lower(btrim(u.department));
  perform set_config('phaseo.entitlement_reconcile','on',true);
  insert into public.workspace_members(workspace_id,user_id,role)
  select workspace_id,user_id,(case when bool_or(access_role='owner') then 'owner' when bool_or(access_role='admin') then 'admin' else 'member' end)::public.workspace_role
  from public.workspace_access_grants where workspace_id=p_workspace_id group by workspace_id,user_id
  on conflict(workspace_id,user_id) do update set role=excluded.role;
  delete from public.workspace_members wm where wm.workspace_id=p_workspace_id and wm.user_id<>owner_id
    and not exists(select 1 from public.workspace_access_grants g where g.workspace_id=wm.workspace_id and g.user_id=wm.user_id);
  perform set_config('phaseo.entitlement_reconcile',case when previous_reconcile_setting='on' then 'on' else 'off' end,true);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."reconcile_scim_entitlements"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."reconcile_scim_entitlements"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reconcile_scim_entitlements"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."reconcile_scim_entitlements"(uuid) FROM PUBLIC, "anon", "authenticated";
