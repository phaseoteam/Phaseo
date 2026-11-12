CREATE OR REPLACE FUNCTION public.reject_catalogue_history_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- DELETE is allowed only through private.prune_catalogue_row_history, which sets this flag for its own
  -- transaction; catalogue_history_prune_guard then checks every row. UPDATE and TRUNCATE always fail.
  if TG_OP = 'DELETE' and coalesce(current_setting('phaseo.catalogue_history_prune', true), '') = 'on' then
    return null;
  end if;
  raise exception 'catalogue history is append-only';
end $function$;

REVOKE ALL ON FUNCTION "public"."reject_catalogue_history_change"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."reject_catalogue_history_change"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."reject_catalogue_history_change"() FROM PUBLIC, "anon", "authenticated", "service_role";
