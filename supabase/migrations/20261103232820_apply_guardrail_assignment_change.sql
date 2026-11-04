-- phaseo:allow-destructive-migration reason: creates public.apply_guardrail_assignment_change, whose DELETE removes only the key and member guardrail assignments an admin asks to remove, in the same transaction as the additions. No data is deleted by this migration.

-- Guardrail assignments: one function adds and removes guardrails on many keys or members in a
-- single transaction, so a failed change leaves every assignment as it was.

SET local check_function_bodies = off;

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
-- Adds and removes guardrails on many keys or members in one transaction, leaving every other
-- assignment as it is. The settings API checks the targets first (keys in this workspace, current
-- members for an add); this only re-checks that the guardrails and keys belong to the workspace.
begin
  if p_target_type not in ('key', 'member') then
    raise exception 'invalid_guardrail_assignment_target';
  end if;

  if (
    select count(*)
    from public.workspace_guardrails
    where workspace_id = p_workspace_id
      and id = any(coalesce(p_add_guardrail_ids, '{}') || coalesce(p_remove_guardrail_ids, '{}'))
  ) <> cardinality(array(select distinct unnest(coalesce(p_add_guardrail_ids, '{}') || coalesce(p_remove_guardrail_ids, '{}')))) then
    raise exception 'guardrail_not_found';
  end if;

  if p_target_type = 'key' then
    if exists (
      select 1 from unnest(p_target_ids) as target(id)
      where not exists (select 1 from public.keys k where k.id = target.id and k.workspace_id = p_workspace_id)
    ) then
      raise exception 'guardrail_assignment_target_not_found';
    end if;

    delete from public.key_guardrails
    where key_id = any(p_target_ids)
      and guardrail_id = any(coalesce(p_remove_guardrail_ids, '{}'));

    insert into public.key_guardrails (key_id, guardrail_id)
    select target_id, guardrail_id
    from unnest(p_target_ids) as target_id
    cross join unnest(coalesce(p_add_guardrail_ids, '{}')) as guardrail_id
    on conflict (key_id, guardrail_id) do nothing;
  else
    delete from public.workspace_member_guardrails
    where workspace_id = p_workspace_id
      and user_id = any(p_target_ids)
      and guardrail_id = any(coalesce(p_remove_guardrail_ids, '{}'));

    insert into public.workspace_member_guardrails (workspace_id, user_id, guardrail_id)
    select p_workspace_id, target_id, guardrail_id
    from unnest(p_target_ids) as target_id
    cross join unnest(coalesce(p_add_guardrail_ids, '{}')) as guardrail_id
    on conflict (workspace_id, user_id, guardrail_id) do nothing;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_guardrail_assignment_change"(uuid, text, uuid[], uuid[], uuid[]) FROM PUBLIC, "anon", "authenticated";
