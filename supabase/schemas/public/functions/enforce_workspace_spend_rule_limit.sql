CREATE OR REPLACE FUNCTION public.enforce_workspace_spend_rule_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit constant integer := 50;
  v_existing integer;
begin
  -- Only rules that become live count: inserts, restores and moves. Deleting never blocks.
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.workspace_id is not distinct from old.workspace_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workspace_spend_rules:' || new.workspace_id::text, 0)
  );

  select count(*) into v_existing
  from public.workspace_spend_rules rule
  where rule.workspace_id = new.workspace_id
    and rule.deleted_at is null
    and rule.id <> new.id;

  if v_existing >= v_limit then
    raise exception 'spend_rule_limit_reached'
      using errcode = '23514',
        detail = pg_catalog.format('A workspace may have %s spend rules.', v_limit);
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() TO "service_role";

COMMENT ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() IS 'Caps each workspace at 50 non-deleted spend rules (an abuse cap, the same on every plan), using a transaction-scoped advisory lock per workspace.';

REVOKE ALL ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_workspace_spend_rule_limit"() FROM PUBLIC, "anon", "authenticated";
