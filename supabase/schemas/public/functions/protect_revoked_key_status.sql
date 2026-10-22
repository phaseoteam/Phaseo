CREATE OR REPLACE FUNCTION public.protect_revoked_key_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- A revoked key was taken out of service because it may be exposed (for
  -- example, a platform it was stored in was breached). It can be deleted but
  -- never made usable again; rotate it to get a new key.
  if old.status = 'revoked' and new.status not in ('revoked', 'deleted') then
    raise exception 'key_revoked_locked'
      using errcode = '23514',
        detail = 'This key was revoked and cannot be turned back on. Rotate it or create a new key.';
  end if;
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, now());
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_revoked_key_status"() IS 'Stops a revoked API key from being resumed, and stamps revoked_at when a key is revoked.';

REVOKE ALL ON FUNCTION "public"."protect_revoked_key_status"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_revoked_key_status"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_revoked_key_status"() FROM PUBLIC, "anon", "authenticated", "service_role";
