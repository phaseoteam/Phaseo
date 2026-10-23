CREATE OR REPLACE FUNCTION public.mark_public_catalogue_purged(
  p_revision bigint
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Never move backwards: a slow cron run must not undo a newer purge.
  update private.public_catalogue_revision
  set purged_revision = greatest(purged_revision, p_revision), purged_at = now(),
    -- Writes committed after the cron read the state keep their start time.
    pending_since = case when revision > greatest(purged_revision, p_revision) then pending_since end
  where singleton;
$function$;

COMMENT ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) IS 'Records that the website caches were purged up to a public catalogue revision.';

GRANT EXECUTE ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mark_public_catalogue_purged"(bigint) FROM PUBLIC, "anon", "authenticated";
