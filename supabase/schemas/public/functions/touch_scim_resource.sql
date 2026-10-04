CREATE OR REPLACE FUNCTION public.touch_scim_resource()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."touch_scim_resource"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."touch_scim_resource"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."touch_scim_resource"() FROM PUBLIC, "anon", "authenticated", "service_role";
