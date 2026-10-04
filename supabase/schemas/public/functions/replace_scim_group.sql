CREATE OR REPLACE FUNCTION public.replace_scim_group (
  p_workspace_id uuid,
  p_group_id     uuid,
  p_external_id  text,
  p_display_name text,
  p_user_ids     uuid[]
)
  RETURNS public.scim_groups
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare replaced public.scim_groups;
begin
  if not exists(select 1 from public.scim_groups where id=p_group_id and workspace_id=p_workspace_id) then raise exception 'SCIM group not found' using errcode='P0002'; end if;
  if exists(select 1 from unnest(coalesce(p_user_ids,'{}'::uuid[])) candidate(user_id) where not exists(select 1 from public.scim_users where id=candidate.user_id and workspace_id=p_workspace_id)) then raise exception 'SCIM user not found in workspace' using errcode='23503'; end if;
  perform set_config('phaseo.scim_group_replace','on',true);
  update public.scim_groups set external_id=p_external_id,display_name=p_display_name where id=p_group_id and workspace_id=p_workspace_id returning * into replaced;
  delete from public.scim_group_members where workspace_id=p_workspace_id and group_id=p_group_id;
  insert into public.scim_group_members(workspace_id,group_id,user_id) select p_workspace_id,p_group_id,user_id from (select distinct unnest(coalesce(p_user_ids,'{}'::uuid[])) user_id) users;
  perform public.reconcile_scim_entitlements(p_workspace_id);
  perform set_config('phaseo.scim_group_replace','off',true);
  perform public.refresh_workspace_effective_entitlements(p_workspace_id,null,'scim_group_replace');
  return replaced;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."replace_scim_group"(uuid, uuid, text, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."replace_scim_group"(uuid, uuid, text, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."replace_scim_group"(uuid, uuid, text, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."replace_scim_group"(uuid, uuid, text, text, uuid[]) FROM PUBLIC, "anon", "authenticated";
