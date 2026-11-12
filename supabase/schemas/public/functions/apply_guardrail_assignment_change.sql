CREATE OR REPLACE FUNCTION public.apply_guardrail_assignment_change (
  p_workspace_id         uuid,
  p_target_type          text,
  p_target_ids           uuid[],
  p_add_guardrail_ids    uuid[],
  p_remove_guardrail_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
-- Adds and removes guardrails on many targets in one transaction, leaving every other assignment
-- as it is. Target types:
-- * 'workspace': the workspace itself. p_target_ids must be empty (or NULL); any id is refused.
-- * 'department': departments of this workspace.
-- * 'member': users. The settings API checks they are current members before an add; a former
--   member's rows can still be removed, because the gateway keeps applying them to their keys.
-- * 'key': keys of this workspace.
-- Key and member assignments are written to key_guardrails and workspace_member_guardrails, whose
-- trigger (private.sync_guardrail_assignments) copies each change into
-- workspace_guardrail_assignments; workspace and department assignments are written there directly.
-- The copy only runs one way, so there is no trigger loop, and older code that still writes the
-- legacy tables stays in step.
declare
  v_add uuid[] := coalesce(p_add_guardrail_ids, '{}');
  v_remove uuid[] := coalesce(p_remove_guardrail_ids, '{}');
  v_targets uuid[] := coalesce(p_target_ids, '{}');
begin
  if p_target_type is null or p_target_type not in ('workspace', 'department', 'member', 'key') then
    raise exception 'invalid_guardrail_assignment_target';
  end if;

  if (
    select count(*)
    from public.workspace_guardrails
    where workspace_id = p_workspace_id
      and id = any(v_add || v_remove)
  ) <> cardinality(array(select distinct unnest(v_add || v_remove))) then
    raise exception 'guardrail_not_found';
  end if;

  if p_target_type = 'workspace' then
    if cardinality(v_targets) > 0 then
      raise exception 'invalid_guardrail_assignment_target';
    end if;

    delete from public.workspace_guardrail_assignments
    where workspace_id = p_workspace_id
      and target_type = 'workspace'
      and guardrail_id = any(v_remove);

    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
    select p_workspace_id, guardrail_id, 'workspace', null
    from unnest(v_add) as guardrail_id
    on conflict do nothing;
  elsif p_target_type = 'department' then
    if exists (
      select 1 from unnest(v_targets) as target(id)
      where not exists (
        select 1 from public.workspace_departments d where d.id = target.id and d.workspace_id = p_workspace_id
      )
    ) then
      raise exception 'guardrail_assignment_target_not_found';
    end if;

    delete from public.workspace_guardrail_assignments
    where workspace_id = p_workspace_id
      and target_type = 'department'
      and target_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
    select p_workspace_id, guardrail_id, 'department', target_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict do nothing;
  elsif p_target_type = 'key' then
    if exists (
      select 1 from unnest(v_targets) as target(id)
      where not exists (select 1 from public.keys k where k.id = target.id and k.workspace_id = p_workspace_id)
    ) then
      raise exception 'guardrail_assignment_target_not_found';
    end if;

    delete from public.key_guardrails
    where key_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.key_guardrails (key_id, guardrail_id)
    select target_id, guardrail_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict (key_id, guardrail_id) do nothing;
  else
    delete from public.workspace_member_guardrails
    where workspace_id = p_workspace_id
      and user_id = any(v_targets)
      and guardrail_id = any(v_remove);

    insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id)
    select p_workspace_id, target_id, guardrail_id
    from unnest(v_targets) as target_id
    cross join unnest(v_add) as guardrail_id
    on conflict (workspace_id, user_id, guardrail_id) do nothing;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM PUBLIC, "anon", "authenticated";
