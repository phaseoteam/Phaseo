-- Creating the trigger locks workspace_classifiers: give up rather than queue behind a long
-- transaction and hold every reader of the table behind this lock.
SET LOCAL lock_timeout = '10s';
SET local check_function_bodies = off;

-- Caps each workspace at 3 enabled data-contribution classifiers. Each one is a model call on
-- Phaseo's OpenAI key per sampled contribution; the API check alone raced under concurrent
-- creates and enables. The trigger also covers the starter classifier's upsert.
CREATE OR REPLACE FUNCTION public.enforce_workspace_classifier_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit constant integer := 3;
  v_existing integer;
begin
  -- Each enabled classifier is one model call on Phaseo's OpenAI key per sampled
  -- contribution. Only rows that become enabled count: inserts, enables and moves.
  if not new.enabled then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.enabled
    and new.workspace_id is not distinct from old.workspace_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workspace_classifiers:' || new.workspace_id::text, 0)
  );

  -- An upsert of an existing slug (the starter classifier) is not a new classifier.
  select count(*) into v_existing
  from public.workspace_classifiers classifier
  where classifier.workspace_id = new.workspace_id
    and classifier.enabled
    and classifier.id <> new.id
    and classifier.slug <> new.slug;

  if v_existing >= v_limit then
    raise exception 'classifier_limit_reached'
      using errcode = '23514',
        detail = pg_catalog.format('A workspace may have %s enabled classifiers.', v_limit);
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_classifier_limit"() TO "service_role";

COMMENT ON FUNCTION "public"."enforce_workspace_classifier_limit"() IS 'Caps each workspace at 3 enabled data-contribution classifiers, using a transaction-scoped advisory lock per workspace.';

REVOKE ALL ON FUNCTION "public"."enforce_workspace_classifier_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_classifier_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_classifier_limit"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER enforce_workspace_classifier_limit
  BEFORE INSERT OR UPDATE OF workspace_id, enabled ON public.workspace_classifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_classifier_limit();
