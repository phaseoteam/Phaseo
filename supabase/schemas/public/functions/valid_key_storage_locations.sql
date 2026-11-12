CREATE OR REPLACE FUNCTION public.valid_key_storage_locations (
  locations text[]
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'pg_catalog'
  AS $function$
  -- Lowercase location ids (packages/shared/key-storage-locations), at most 8.
  select locations is not null
    and cardinality(locations) <= 8
    and not exists (
      select 1 from unnest(locations) as location
      where location is null or location !~ '^[a-z0-9][a-z0-9-]{0,39}$'
    );
$function$;

GRANT EXECUTE ON FUNCTION "public"."valid_key_storage_locations"(text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."valid_key_storage_locations"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."valid_key_storage_locations"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."valid_key_storage_locations"(text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."valid_key_storage_locations"(text[]) FROM PUBLIC, "anon";
