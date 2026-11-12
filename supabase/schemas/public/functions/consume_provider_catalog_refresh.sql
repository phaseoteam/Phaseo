CREATE OR REPLACE FUNCTION public.consume_provider_catalog_refresh (
  p_provider_slug text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  affected integer;
begin
  update public.provider_catalog_sources
  set refresh_requested = false, updated_at = now()
  where provider_slug = p_provider_slug and refresh_requested = true;
  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."consume_provider_catalog_refresh"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_provider_catalog_refresh"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_provider_catalog_refresh"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."consume_provider_catalog_refresh"(text) FROM PUBLIC, "anon", "authenticated";
