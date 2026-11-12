CREATE OR REPLACE FUNCTION public.validate_workspace_spend_rule()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'spend_rule_workspace_immutable'
      using errcode = '22023',
        detail = 'A spend rule cannot move to another workspace.';
  end if;

  new.name := pg_catalog.btrim(new.name);
  new.scope_id := nullif(pg_catalog.btrim(new.scope_id), '');

  -- Key, member and department scopes hold a uuid. Checked here, before the generated
  -- scope_*_id columns cast it, so the error names the field.
  if new.scope_type in ('key', 'member', 'department') then
    if new.scope_id is null
      or new.scope_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_spend_rule_scope_id'
        using errcode = '22023',
          detail = pg_catalog.format('A %s scope needs the %s id.', new.scope_type, new.scope_type);
    end if;
    new.scope_id := pg_catalog.lower(new.scope_id);
  end if;

  if new.time_zone is not null then
    new.time_zone := nullif(pg_catalog.btrim(new.time_zone), '');
    if new.time_zone is not null and not private.is_valid_time_zone(new.time_zone) then
      raise exception 'invalid_time_zone'
        using errcode = '22023',
          detail = pg_catalog.format('%s is not an IANA time zone.', new.time_zone);
    end if;
  end if;

  -- Thresholds are stored sorted and distinct; the CHECK constraints then bound them.
  if new.threshold_percents is not null then
    new.threshold_percents := array(
      select distinct threshold
      from pg_catalog.unnest(new.threshold_percents) as threshold
      order by threshold
    );
    if pg_catalog.cardinality(new.threshold_percents) = 0 then
      new.threshold_percents := null;
    end if;
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_spend_rule"() TO "service_role";

COMMENT ON FUNCTION "public"."validate_workspace_spend_rule"() IS 'Normalizes and validates a spend rule before the CHECK constraints run: keeps the workspace fixed, trims names, requires uuid ids for key, member and department scopes, validates the IANA time zone, and sorts and dedupes threshold_percents.';

REVOKE ALL ON FUNCTION "public"."validate_workspace_spend_rule"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."validate_workspace_spend_rule"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."validate_workspace_spend_rule"() FROM PUBLIC, "anon", "authenticated";
