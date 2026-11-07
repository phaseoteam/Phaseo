CREATE OR REPLACE FUNCTION private.pending_json_cutoff ()
  RETURNS timestamp with time zone
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Rows created before this are pending reconciliation by their JSON billing_status as well as
-- by expected_cost_nanos; see private.billing_cutoffs. -infinity (the flag is never read) if the
-- marker is missing.
  select coalesce((select pending_json_cutoff from private.billing_cutoffs where singleton), '-infinity'::timestamptz);
$function$;

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."pending_json_cutoff"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."pending_json_cutoff"() TO "postgres";
