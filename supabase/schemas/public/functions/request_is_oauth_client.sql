CREATE OR REPLACE FUNCTION public.request_is_oauth_client ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (auth.jwt() ->> 'client_id') is not null;
$function$;

COMMENT ON FUNCTION "public"."request_is_oauth_client"() IS 'True when the request carries a token the OAuth server issued to an app (it has a top-level client_id). Restrictive RLS policies and SECURITY DEFINER functions use it to refuse writes from app tokens, including the public CLI and desktop clients.';

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."request_is_oauth_client"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."request_is_oauth_client"() FROM PUBLIC, "anon";
