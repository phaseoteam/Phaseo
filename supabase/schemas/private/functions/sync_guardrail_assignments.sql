CREATE OR REPLACE FUNCTION private.sync_guardrail_assignments()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Keeps public.workspace_guardrail_assignments in step with the tables it replaces.
-- key_guardrails and workspace_member_guardrails: one-way copy of every insert, update and delete.
-- Key and member assignments are still written to those tables (by apply_guardrail_assignment_change
-- and by older code), so nothing writes key or member rows here directly and nothing copies back,
-- which rules out trigger loops. The copy runs with the definer's rights because admins may write
-- the legacy tables through their RLS policies, while the new table is service role only.
-- workspace_departments: a deleted department's assignments go with it.
begin
  if tg_table_name = 'workspace_departments' then
    delete from public.workspace_guardrail_assignments a
    where a.workspace_id = old.workspace_id
      and a.target_type = 'department'
      and a.target_id = old.id;
    return null;
  end if;

  if tg_op in ('DELETE', 'UPDATE') then
    if tg_table_name = 'key_guardrails' then
      delete from public.workspace_guardrail_assignments a
      where a.guardrail_id = old.guardrail_id
        and a.target_type = 'key'
        and a.target_id = old.key_id;
    else
      delete from public.workspace_guardrail_assignments a
      where a.guardrail_id = old.guardrail_id
        and a.target_type = 'member'
        and a.target_id = old.user_id
        and a.workspace_id = old.workspace_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_table_name = 'key_guardrails' then
      insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
      select g.workspace_id, g.id, 'key', new.key_id
      from public.workspace_guardrails g
      where g.id = new.guardrail_id
      on conflict do nothing;
    else
      insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
      values (new.workspace_id, new.guardrail_id, 'member', new.user_id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$function$;

COMMENT ON FUNCTION "private"."sync_guardrail_assignments"() IS 'Copies key_guardrails and workspace_member_guardrails changes into workspace_guardrail_assignments (one way), and removes a deleted department''s assignments.';

REVOKE ALL ON FUNCTION "private"."sync_guardrail_assignments"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."sync_guardrail_assignments"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_guardrail_assignments"() TO "postgres";
