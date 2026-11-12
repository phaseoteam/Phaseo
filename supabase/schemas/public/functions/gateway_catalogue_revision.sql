CREATE OR REPLACE FUNCTION public.gateway_catalogue_revision()
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select revision::text from private.routing_catalogue_revision where singleton;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_catalogue_revision"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_catalogue_revision"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_catalogue_revision"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_catalogue_revision"() FROM PUBLIC, "anon", "authenticated";
