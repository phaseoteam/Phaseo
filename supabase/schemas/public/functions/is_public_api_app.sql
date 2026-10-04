CREATE OR REPLACE FUNCTION public.is_public_api_app (
  p_app_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce((
    select app.is_public
    from public.api_apps app
    where app.id = p_app_id
  ), false);
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_public_api_app"(uuid) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_public_api_app"(uuid) TO "service_role";

COMMENT ON FUNCTION "public"."is_public_api_app"(uuid) IS 'RLS-safe public-app visibility lookup that exposes only a boolean classification.';

REVOKE ALL ON FUNCTION "public"."is_public_api_app"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."is_public_api_app"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_public_api_app"(uuid) TO "postgres";
