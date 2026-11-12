CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_artifacts()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from public.oauth_authorization_codes where expires_at < now() - interval '1 hour';
  delete from public.oauth_device_codes where expires_at < now() - interval '1 hour';
  delete from public.oauth_refresh_tokens token
  where token.expires_at < now() - interval '1 day'
    and not exists (
      select 1 from public.oauth_refresh_tokens child
      where child.rotated_from = token.id
    );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_oauth_artifacts"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_expired_oauth_artifacts"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cleanup_expired_oauth_artifacts"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."cleanup_expired_oauth_artifacts"() FROM PUBLIC, "anon", "authenticated";
