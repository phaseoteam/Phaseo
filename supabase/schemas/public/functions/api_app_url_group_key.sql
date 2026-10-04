CREATE OR REPLACE FUNCTION public.api_app_url_group_key (
  p_url    text,
  p_app_id text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select coalesce(
    nullif(lower(regexp_replace(btrim(coalesce(p_url, '')), '/+$', '')), ''),
    'app-id:' || p_app_id
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."api_app_url_group_key"(text, text) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."api_app_url_group_key"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."api_app_url_group_key"(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."api_app_url_group_key"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."api_app_url_group_key"(text, text) TO "postgres";
