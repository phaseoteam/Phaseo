CREATE OR REPLACE FUNCTION public.refresh_effective_entitlements_after_directory_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare target_workspace_id uuid;
begin
  if current_setting('phaseo.scim_group_replace',true)='on' then return coalesce(new,old); end if;
  target_workspace_id := coalesce(new.workspace_id,old.workspace_id);
  perform set_config('phaseo.entitlement_reconcile','on',true);
  update public.workspace_members wm set role=o.access_role::public.workspace_role
  from public.workspace_member_overrides o
  where wm.workspace_id=target_workspace_id and wm.workspace_id=o.workspace_id and wm.user_id=o.user_id and o.access_role is not null
    and lower(wm.role::text) is distinct from o.access_role;
  perform public.refresh_workspace_effective_entitlements(target_workspace_id,null,'directory_sync');
  return coalesce(new,old);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_effective_entitlements_after_directory_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_effective_entitlements_after_directory_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_effective_entitlements_after_directory_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_effective_entitlements_after_directory_change"() FROM PUBLIC, "anon", "authenticated";
