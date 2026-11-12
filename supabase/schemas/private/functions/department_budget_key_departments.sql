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
  -- departments are their directory override when one is enabled, otherwise every department
  -- grant, or with workspace_settings.department_spend_attribution = 'primary' only the grant
  -- spend_scope_departments picks (the primary one, then manual over SCIM, then the oldest).
  -- The gateway's department rate limits count members the same way.
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
  primary_only as (
    select coalesce((
      select s.department_spend_attribution = 'primary'
      from public.workspace_settings s
      where s.workspace_id = p_workspace_id
    ), false) as value
  ),
  ranked_grants as (
    select g.user_id, g.department_id,
      row_number() over (
        partition by g.user_id
        order by g.is_primary desc, (g.source_type = 'manual') desc, g.created_at, g.department_id
      ) as rank
    from public.workspace_department_grants g
    where g.workspace_id = p_workspace_id
      and not exists (select 1 from overrides o where o.user_id = g.user_id)
  ),
  member_departments as (
    select g.user_id, g.department_id
    from ranked_grants g, primary_only
    where not primary_only.value or g.rank = 1
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

COMMENT ON FUNCTION "private"."department_budget_key_departments"(uuid) IS 'API keys counting toward each budgeted department of a workspace: keys linked to the department, plus unlinked keys created by (or OAuth-delegated to) its members. Members'' departments are their directory override when enabled, else their grants (only the primary one when workspace_settings.department_spend_attribution is primary).';

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_key_departments"(uuid) TO "postgres";
