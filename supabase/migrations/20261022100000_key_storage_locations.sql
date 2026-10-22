SET local check_function_bodies = off;

-- Where a workspace keeps each API key (hosting platform, CI secrets, password
-- manager, ...). Optional. Lets a workspace, or Phaseo during a platform breach,
-- find and pause or revoke every key stored in one place.
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

ALTER TABLE "public"."keys" ADD COLUMN "storage_locations" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."keys" ADD CONSTRAINT "keys_storage_locations_valid" CHECK (public.valid_key_storage_locations(storage_locations));

COMMENT ON COLUMN "public"."keys"."storage_locations" IS 'Location ids (packages/shared/key-storage-locations) where the workspace says this key is stored, such as railway or github. Empty when not given. Used to find every key kept in a platform that reports a breach.';

CREATE INDEX keys_storage_locations_idx ON public.keys USING gin (storage_locations)
  WHERE (cardinality(storage_locations) > 0);
