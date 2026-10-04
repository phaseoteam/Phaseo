CREATE OR REPLACE FUNCTION public.prevent_catalogue_removal()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin raise exception 'saved catalogue records cannot be deleted; set an end date instead'; end $function$;

REVOKE ALL ON FUNCTION "public"."prevent_catalogue_removal"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prevent_catalogue_removal"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."prevent_catalogue_removal"() FROM PUBLIC, "anon", "authenticated", "service_role";
