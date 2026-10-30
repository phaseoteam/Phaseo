CREATE OR REPLACE FUNCTION private.department_budget_key_departments (
  p_workspace_id uuid
)
  RETURNS TABLE (
    key_id        uuid,
    department_id uuid
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The API keys whose cost counts toward each department that has a budget in the workspace,
  -- one row per key and department. A department's keys are the keys linked to it
  -- (keys.department_id), plus, for keys not linked to any department, the keys its members
  -- created and their OAuth keys (OAuth requests use the user's delegated key). A member's
  -- departments are their department grants, or their directory override when one is enabled,
  -- as the gateway's rate limits count them; a member in several departments counts toward each.
  -- Shared by workspace_department_budget_status (alerts) and gateway_spend_limit_seed (blocking).
  with budgeted as (
    select distinct b.department_id
    from public.workspace_department_budgets b
    where b.workspace_id = p_workspace_id
  ),
  overrides as (
    select o.user_id, o.department_id
    from public.workspace_member_overrides o
    where o.workspace_id = p_workspace_id
      and o.department_override_enabled
  ),
  member_departments as (
    select g.user_id, g.department_id
    from public.workspace_department_grants g
    where g.workspace_id = p_workspace_id
      and not exists (select 1 from overrides o where o.user_id = g.user_id)
    union
    select o.user_id, o.department_id from overrides o where o.department_id is not null
  )
  select k.id, k.department_id
  from public.keys k
  where k.workspace_id = p_workspace_id
    and k.department_id in (select budgeted.department_id from budgeted)
  union
  select k.id, m.department_id
  from public.keys k
  join member_departments m on m.user_id = coalesce(k.oauth_user_id, k.created_by)
  where k.workspace_id = p_workspace_id
    and k.department_id is null
    and m.department_id in (select budgeted.department_id from budgeted);
$function$;

COMMENT ON FUNCTION "private"."department_budget_key_departments"(uuid) IS 'API keys counting toward each budgeted department of a workspace: keys linked to the department, plus unlinked keys created by (or OAuth-delegated to) its members. Members'' departments are their grants, or their directory override when enabled.';

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_key_departments"(uuid) TO "postgres";
