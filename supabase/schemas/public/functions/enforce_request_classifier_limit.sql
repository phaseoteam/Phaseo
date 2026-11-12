CREATE OR REPLACE FUNCTION public.enforce_request_classifier_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit constant integer := 5;
  v_existing integer;
begin
  if tg_op = 'UPDATE' and new.workspace_id is not distinct from old.workspace_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request_classifier:' || new.workspace_id::text, 0)
  );

  select count(*) into v_existing
  from public.workspace_request_classifiers classifier
  where classifier.workspace_id = new.workspace_id
    and classifier.id <> new.id;

  if v_existing >= v_limit then
    raise exception 'request_classifier_limit_reached'
      using errcode = '23514',
        detail = pg_catalog.format('A workspace may have %s classifiers.', v_limit);
  end if;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."enforce_request_classifier_limit"() IS 'Caps request classifiers at 5 per workspace using a transaction-scoped advisory lock.';

REVOKE ALL ON FUNCTION "public"."enforce_request_classifier_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_request_classifier_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_request_classifier_limit"() FROM PUBLIC, "anon", "authenticated";
