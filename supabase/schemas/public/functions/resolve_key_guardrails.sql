CREATE OR REPLACE FUNCTION public.resolve_key_guardrails (
  p_workspace_id uuid,
  p_key_id       uuid
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
  -- The enabled guardrails that apply to one API key, one row per guardrail and the level it is
  -- assigned at (a guardrail assigned at two levels appears twice):
  -- 1. workspace: every key in the workspace (source_id is NULL);
  -- 2. department: the key's departments as spend_scope_departments counts them (a standard key's
  --    own department, else its principal's override department, else all their departments or
  --    only the primary one, as workspace_settings.department_spend_attribution says);
  -- 3. member: the key's principal (oauth_user_id, else created_by), even after they leave;
  -- 4. key: the key itself.
  -- Empty when the key is not in the workspace.
  with key_row as (
    select k.id, coalesce(k.oauth_user_id, k.created_by) as principal_id
    from public.keys k
    where k.id = p_key_id
      and k.workspace_id = p_workspace_id
  ),
  targets as (
    select 'department'::text as target_type, departments.department_id as target_id
    from key_row
    cross join lateral private.spend_scope_departments(p_workspace_id, key_row.id, key_row.principal_id) as departments(department_id)
    union all
    select 'member', key_row.principal_id from key_row where key_row.principal_id is not null
    union all
    select 'key', key_row.id from key_row
  ),
  assigned as (
    select a.guardrail_id, a.target_type, a.target_id
    from public.workspace_guardrail_assignments a
    where a.workspace_id = p_workspace_id
      and a.target_type = 'workspace'
      and a.target_id is null
      and exists (select 1 from key_row)
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

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) TO "service_role";

COMMENT ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) IS 'Enabled guardrails that apply to an API key, with the level each is assigned at: workspace, the key''s departments (as spend_scope_departments counts them), its principal member (even after they leave) or the key itself.';

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_key_guardrails"(uuid, uuid) FROM PUBLIC, "anon", "authenticated";
