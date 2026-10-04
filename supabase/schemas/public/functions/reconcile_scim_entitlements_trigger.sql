CREATE OR REPLACE FUNCTION public.reconcile_scim_entitlements_trigger()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_setting('phaseo.scim_group_replace',true)='on' then return coalesce(new,old); end if;
  perform public.reconcile_scim_entitlements(coalesce(new.workspace_id,old.workspace_id));
  return coalesce(new,old);
end $function$;

REVOKE ALL ON FUNCTION "public"."reconcile_scim_entitlements_trigger"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reconcile_scim_entitlements_trigger"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."reconcile_scim_entitlements_trigger"() FROM PUBLIC, "anon", "authenticated", "service_role";
