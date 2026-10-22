CREATE OR REPLACE FUNCTION public.get_public_catalogue_purge_state()
  RETURNS TABLE (
    revision        bigint,
    changed_at      timestamp with time zone,
    purged_revision bigint,
    pending_since   timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select r.revision, r.changed_at, r.purged_revision, r.pending_since
  from private.public_catalogue_revision r
  where r.singleton;
$function$;

COMMENT ON FUNCTION "public"."get_public_catalogue_purge_state"() IS 'Public catalogue revision and the last revision the web-api cron purged from the website caches.';

GRANT EXECUTE ON FUNCTION "public"."get_public_catalogue_purge_state"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_catalogue_purge_state"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_catalogue_purge_state"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_catalogue_purge_state"() FROM PUBLIC, "anon", "authenticated";
