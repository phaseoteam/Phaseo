CREATE OR REPLACE FUNCTION public.release_provider_catalog_sync (
  p_provider_slug text,
  p_lease_token   uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO 'public'
  AS $function$
  update public.provider_catalog_sources
  set sync_lease_token = null, sync_lease_expires_at = null, updated_at = now()
  where provider_slug = p_provider_slug and sync_lease_token = p_lease_token;
$function$;

GRANT EXECUTE ON FUNCTION "public"."release_provider_catalog_sync"(text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."release_provider_catalog_sync"(text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."release_provider_catalog_sync"(text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."release_provider_catalog_sync"(text, uuid) FROM PUBLIC, "anon", "authenticated";
