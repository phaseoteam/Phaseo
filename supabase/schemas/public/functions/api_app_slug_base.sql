CREATE OR REPLACE FUNCTION public.api_app_slug_base (
  p_title text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'app'
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."api_app_slug_base"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."api_app_slug_base"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."api_app_slug_base"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."api_app_slug_base"(text) FROM PUBLIC, "anon", "authenticated";
