CREATE OR REPLACE FUNCTION public.reject_scim_audit_event_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception 'SCIM audit events are append-only';
end;
$function$;

REVOKE ALL ON FUNCTION "public"."reject_scim_audit_event_mutation"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_scim_audit_event_mutation"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."reject_scim_audit_event_mutation"() FROM PUBLIC, "anon", "authenticated", "service_role";
