CREATE OR REPLACE FUNCTION catalogue_private.guard_row_history_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if coalesce(current_setting('phaseo.catalogue_history_prune', true), '') = 'on'
     and OLD.table_name = 'v2_benchmark_results'
     and OLD.operation = 'UPDATE' then
    return OLD;
  end if;
  raise exception 'catalogue history is append-only';
end $function$;

REVOKE ALL ON FUNCTION "catalogue_private"."guard_row_history_delete"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "catalogue_private"."guard_row_history_delete"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "catalogue_private"."guard_row_history_delete"() TO "postgres";
