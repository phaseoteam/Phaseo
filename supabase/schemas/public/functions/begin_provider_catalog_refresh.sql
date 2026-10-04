CREATE OR REPLACE FUNCTION public.begin_provider_catalog_refresh (
  p_provider_slug text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  update public.provider_catalog_sources
  set refresh_requested = false,
      next_poll_at = case when management_mode = 'managed' then null else next_poll_at end
  where provider_slug = p_provider_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."begin_provider_catalog_refresh"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."begin_provider_catalog_refresh"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."begin_provider_catalog_refresh"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."begin_provider_catalog_refresh"(text) FROM PUBLIC, "anon", "authenticated";
