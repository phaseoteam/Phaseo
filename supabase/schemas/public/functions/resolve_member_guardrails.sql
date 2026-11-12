CREATE OR REPLACE FUNCTION public.resolve_member_guardrails (
  p_workspace_id uuid,
  p_user_id      uuid
)
  RETURNS TABLE (
    guardrail_id uuid,
    source_type  text,
    source_id    uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The enabled guardrails that apply to a key this member creates without a department of its
  -- own (e.g. their Chat key): the workspace, the member's departments as spend_scope_departments
  -- counts them for a key with no department, and the member. One row per guardrail and level,
  -- the same shape as resolve_key_guardrails, so Chat shows what the gateway enforces.
  with targets as (
    select 'department'::text as target_type, departments.department_id as target_id
    from private.spend_scope_departments(p_workspace_id, null, p_user_id) as departments(department_id)
    union all
    select 'member', p_user_id where p_user_id is not null
  ),
  assigned as (
    select a.guardrail_id, a.target_type, a.target_id
    from public.workspace_guardrail_assignments a
    where a.workspace_id = p_workspace_id
      and a.target_type = 'workspace'
      and a.target_id is null
    union all
    select a.guardrail_id, a.target_type, a.target_id
    from targets t
    join public.workspace_guardrail_assignments a
      on a.workspace_id = p_workspace_id
     and a.target_type = t.target_type
     and a.target_id = t.target_id
  )
  select assigned.guardrail_id, assigned.target_type, assigned.target_id
  from assigned
  join public.workspace_guardrails g
    on g.id = assigned.guardrail_id
   and g.workspace_id = p_workspace_id
   and g.enabled
  order by assigned.guardrail_id, assigned.target_type, assigned.target_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) IS 'Enabled guardrails that apply to a key a member creates with no department of its own (such as their Chat key): the workspace, the member''s departments and the member, with the level each is assigned at.';

REVOKE ALL ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_member_guardrails"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
