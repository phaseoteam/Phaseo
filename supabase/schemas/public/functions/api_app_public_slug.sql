CREATE OR REPLACE FUNCTION public.api_app_public_slug (
  p_title  text,
  p_url    text,
  p_app_id text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select public.api_app_slug_base(p_title) || '--' || left(md5(coalesce(p_app_id, '')), 12);
$function$;

GRANT EXECUTE ON FUNCTION "public"."api_app_public_slug"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."api_app_public_slug"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."api_app_public_slug"(text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."api_app_public_slug"(text, text, text) FROM PUBLIC, "anon", "authenticated";
