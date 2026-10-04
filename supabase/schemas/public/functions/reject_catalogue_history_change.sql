CREATE OR REPLACE FUNCTION public.reject_catalogue_history_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin raise exception 'catalogue history is append-only'; end $function$;

REVOKE ALL ON FUNCTION "public"."reject_catalogue_history_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_catalogue_history_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."reject_catalogue_history_change"() FROM PUBLIC, "anon", "authenticated", "service_role";
