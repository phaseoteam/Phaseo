CREATE OR REPLACE FUNCTION private.bump_public_catalogue_revision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Rewrites that only touch updated_at change nothing a visitor can see, so
  -- they must not empty the website caches.
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;
  -- One bump per transaction: after the first changed row, the singleton
  -- already carries this transaction's id and the update matches nothing.
  update private.public_catalogue_revision
  set revision = revision + 1, changed_at = clock_timestamp(), changed_xid = pg_current_xact_id(),
    pending_since = coalesce(pending_since, clock_timestamp())
  where singleton and changed_xid is distinct from pg_current_xact_id();
  return null;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."bump_public_catalogue_revision"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."bump_public_catalogue_revision"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."bump_public_catalogue_revision"() TO "postgres";
