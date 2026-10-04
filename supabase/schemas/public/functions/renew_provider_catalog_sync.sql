CREATE OR REPLACE FUNCTION public.renew_provider_catalog_sync (
  p_provider_slug text,
  p_lease_token   uuid,
  p_lease_seconds integer DEFAULT 120
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  affected integer;
begin
  update public.provider_catalog_sources
  set sync_lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 300))),
      updated_at = now()
  where provider_slug = p_provider_slug
    and sync_lease_token = p_lease_token
    and sync_lease_expires_at > now();
  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."renew_provider_catalog_sync"(text, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."renew_provider_catalog_sync"(text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."renew_provider_catalog_sync"(text, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."renew_provider_catalog_sync"(text, uuid, integer) FROM PUBLIC, "anon", "authenticated";
