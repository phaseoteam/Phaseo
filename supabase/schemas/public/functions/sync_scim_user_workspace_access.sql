CREATE OR REPLACE FUNCTION public.sync_scim_user_workspace_access()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.reconcile_scim_entitlements(new.workspace_id);
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sync_scim_user_workspace_access"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_scim_user_workspace_access"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_scim_user_workspace_access"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_scim_user_workspace_access"() FROM PUBLIC, "anon", "authenticated";
