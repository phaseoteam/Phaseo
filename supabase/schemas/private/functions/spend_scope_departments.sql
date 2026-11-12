CREATE OR REPLACE FUNCTION private.spend_scope_departments (
  p_workspace_id  uuid,
  p_key_id        uuid,
  p_actor_user_id uuid
)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The departments spend rules count one key and actor's spend toward, as of now:
  -- 1. A standard key's own department wins.
  -- 2. Otherwise the actor's (the key's creator or the OAuth user): a manual override on
  --    workspace_member_overrides replaces their directory departments, as it does for their
  --    entitlements (an override with no department means none).
  -- 3. Otherwise every department in workspace_department_grants, or with
  --    workspace_settings.department_spend_attribution = 'primary' only the one their
  --    entitlements pick: the primary grant, then manual over SCIM, then the oldest.
  -- OAuth-delegated keys always use the user, as keys.department_id documents.
  -- Membership is read at call time, so moving someone moves their spend for the period.
  with explicit as (
    select key.department_id
    from public.keys key
    where key.id = p_key_id
      and key.workspace_id = p_workspace_id
      and key.key_kind = 'standard'
      and key.department_id is not null
  ),
  override as (
    select override.department_id
    from public.workspace_member_overrides override
    where override.workspace_id = p_workspace_id
      and override.user_id = p_actor_user_id
      and override.department_override_enabled
  ),
  grants as (
    select grant_row.department_id,
      row_number() over (
        order by grant_row.is_primary desc, (grant_row.source_type = 'manual') desc, grant_row.created_at, grant_row.department_id
      ) as rank
    from public.workspace_department_grants grant_row
    where grant_row.workspace_id = p_workspace_id
      and grant_row.user_id = p_actor_user_id
  ),
  primary_only as (
    select coalesce((
      select settings.department_spend_attribution = 'primary'
      from public.workspace_settings settings
      where settings.workspace_id = p_workspace_id
    ), false) as value
  )
  select explicit.department_id from explicit
  union
  select override.department_id from override
  where override.department_id is not null
    and not exists (select 1 from explicit)
  union
  select grants.department_id from grants, primary_only
  where not exists (select 1 from explicit)
    and not exists (select 1 from override)
    and (not primary_only.value or grants.rank = 1);
$function$;

COMMENT ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) IS 'Departments that spend by one key and actor counts toward for spend rules: a standard key''s own department, else the actor''s override department, else all their departments (or only the primary one when workspace_settings.department_spend_attribution is primary). Empty when none apply.';

REVOKE ALL ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_departments"(uuid, uuid, uuid) TO "service_role";
