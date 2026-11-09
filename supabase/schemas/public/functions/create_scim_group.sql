CREATE OR REPLACE FUNCTION public.create_scim_group (
  p_workspace_id uuid,
  p_external_id  text,
  p_display_name text,
  p_user_ids     uuid[]
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare created public.scim_groups;
begin
  -- The group and its members are created in one transaction, so a failure never leaves an empty or
  -- half-filled group behind (group mappings can make its members admins).
  if exists(select 1 from unnest(coalesce(p_user_ids,'{}'::uuid[])) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then raise exception 'SCIM user not found in workspace' using errcode='23503'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  insert into public.scim_groups(workspace_id,external_id,display_name) values (p_workspace_id,p_external_id,p_display_name) returning * into created;
  insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,created.id,user_id from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) user_id) users;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  -- The per-row triggers are off for this bulk write, so owner role overrides are reapplied here.
  perform public.apply_workspace_role_overrides(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_create');
  return created;
end;
$function$;

COMMENT ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) IS 'Creates a SCIM group with its members in one transaction, then reconciles directory entitlements once.';

GRANT EXECUTE ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_scim_group"(uuid, text, text, uuid[]) FROM PUBLIC, "anon", "authenticated";
