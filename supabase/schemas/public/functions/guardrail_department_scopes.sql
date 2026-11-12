CREATE OR REPLACE FUNCTION public.guardrail_department_scopes (
  p_workspace_id uuid
)
  RETURNS TABLE (
    target_type   text,
    target_id     uuid,
    department_id uuid
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The departments whose guardrails reach each key and member of a workspace, as the gateway
  -- counts them (spend_scope_departments, the same call resolve_key_guardrails and
  -- resolve_member_guardrails make), so Settings, Guardrails can show where every guardrail comes from:
  -- 1. key: each key that is not deleted, with its principal (oauth_user_id, else created_by);
  -- 2. member: each member, for a key they create with no department of its own.
  -- One row per target and department; a target with no department has no rows.
  select 'key'::text, key.id, departments.department_id
  from public.keys key
  cross join lateral private.spend_scope_departments(p_workspace_id, key.id, coalesce(key.oauth_user_id, key.created_by)) as departments(department_id)
  where key.workspace_id = p_workspace_id
    and key.status <> 'deleted'
  union all
  select 'member', member.user_id, departments.department_id
  from public.workspace_members member
  cross join lateral private.spend_scope_departments(p_workspace_id, null, member.user_id) as departments(department_id)
  where member.workspace_id = p_workspace_id
  order by 1, 2, 3;
$function$;

GRANT EXECUTE ON FUNCTION "public"."guardrail_department_scopes"(uuid) TO "service_role";

COMMENT ON FUNCTION "public"."guardrail_department_scopes"(uuid) IS 'The departments whose guardrails reach each key (not deleted) and member of a workspace, as spend_scope_departments counts them for the gateway. One row per target and department.';

REVOKE ALL ON FUNCTION "public"."guardrail_department_scopes"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."guardrail_department_scopes"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."guardrail_department_scopes"(uuid) FROM PUBLIC, "anon", "authenticated";
