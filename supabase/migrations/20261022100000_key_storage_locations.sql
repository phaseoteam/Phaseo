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

-- Revoked keys stay revoked: a key revoked because it may be exposed can be
-- deleted or rotated, never resumed.
CREATE OR REPLACE FUNCTION public.protect_revoked_key_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- A revoked key was taken out of service because it may be exposed (for
  -- example, a platform it was stored in was breached); a compromised key was
  -- reported as publicly leaked. These and deleted keys are final: they can
  -- move between those states but never become usable again, so revoking then
  -- deleting a key can't be used to bring it back. Rotate it to get a new key.
  if old.status in ('revoked', 'compromised', 'deleted') and new.status not in ('revoked', 'compromised', 'deleted') then
    raise exception 'key_revoked_locked'
      using errcode = '23514',
        detail = 'This key was revoked or deleted and cannot be turned back on. Rotate it or create a new key.';
  end if;
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, now());
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_revoked_key_status"() IS 'Stops a revoked, compromised or deleted API key from becoming usable again, and stamps revoked_at when a key is revoked.';

REVOKE ALL ON FUNCTION "public"."protect_revoked_key_status"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_revoked_key_status"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_revoked_key_status"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER protect_revoked_key_status
  BEFORE UPDATE OF status ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_revoked_key_status();
