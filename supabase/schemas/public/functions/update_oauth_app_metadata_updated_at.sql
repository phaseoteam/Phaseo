CREATE OR REPLACE FUNCTION public.update_oauth_app_metadata_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."update_oauth_app_metadata_updated_at"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_oauth_app_metadata_updated_at"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."update_oauth_app_metadata_updated_at"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."update_oauth_app_metadata_updated_at"() FROM PUBLIC, "anon", "authenticated";
