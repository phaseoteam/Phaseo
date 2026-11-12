CREATE OR REPLACE FUNCTION public.update_management_key_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."update_management_key_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_management_key_updated_at"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_management_key_updated_at"() FROM PUBLIC, "anon", "authenticated", "service_role";
