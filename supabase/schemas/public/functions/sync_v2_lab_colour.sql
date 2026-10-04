CREATE OR REPLACE FUNCTION public.sync_v2_lab_colour()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.colour := nullif(new.metadata->>'colour', '');
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."sync_v2_lab_colour"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_v2_lab_colour"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_v2_lab_colour"() FROM PUBLIC, "anon", "authenticated", "service_role";
