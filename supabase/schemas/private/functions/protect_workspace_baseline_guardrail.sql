CREATE OR REPLACE FUNCTION private.protect_workspace_baseline_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
-- Runs with the caller's rights so current_user is the client role on a direct client insert.
-- The workspace baseline (workspace_guardrails.is_workspace_baseline) holds the workspace-wide rules
-- the Privacy page edits. It stays an enabled access guardrail in its workspace, assigned to the whole
-- workspace and to nothing else. Its name, description and rules can change; it cannot be deleted,
-- disabled, given another kind, unassigned, or assigned to a department, member or key. Only
-- private.ensure_workspace_baseline_guardrail creates one (clients cannot insert a baseline, and an
-- existing guardrail cannot become one). Deletes cascading from a deleted workspace pass.
declare
  v_protected boolean := false;
begin
  if tg_table_name = 'workspace_guardrails' then
    if tg_op = 'INSERT' then
      v_protected := new.is_workspace_baseline and current_user in ('anon', 'authenticated');
    elsif tg_op = 'DELETE' then
      v_protected := old.is_workspace_baseline and pg_catalog.pg_trigger_depth() = 1;
    else
      v_protected := old.is_workspace_baseline is distinct from new.is_workspace_baseline
        or (new.is_workspace_baseline and (
          new.kind is distinct from 'access'
          or not new.enabled
          or new.workspace_id is distinct from old.workspace_id));
    end if;
  else
    -- workspace_guardrail_assignments
    if tg_op in ('DELETE', 'UPDATE') and pg_catalog.pg_trigger_depth() = 1 then
      v_protected := exists (
        select 1 from public.workspace_guardrails g
        where g.id = old.guardrail_id and g.is_workspace_baseline
      );
    end if;
    if not v_protected and tg_op in ('INSERT', 'UPDATE') and new.target_type is distinct from 'workspace' then
      v_protected := exists (
        select 1 from public.workspace_guardrails g
        where g.id = new.guardrail_id and g.is_workspace_baseline
      );
    end if;
  end if;

  if v_protected then
    raise exception 'workspace_baseline_guardrail_protected'
      using errcode = '23514',
        detail = 'The workspace baseline holds the rules set under Settings, Privacy. It stays on, stays an access guardrail and applies to the whole workspace, and it cannot be deleted.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "private"."protect_workspace_baseline_guardrail"() IS 'Keeps each workspace''s baseline guardrail an enabled access guardrail assigned only to the whole workspace: it cannot be deleted (except with its workspace), disabled, change kind, be unassigned or be assigned at another level.';

REVOKE ALL ON FUNCTION "private"."protect_workspace_baseline_guardrail"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."protect_workspace_baseline_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."protect_workspace_baseline_guardrail"() TO "postgres";
