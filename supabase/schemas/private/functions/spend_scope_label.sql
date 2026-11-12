CREATE OR REPLACE FUNCTION private.spend_scope_label (
  p_workspace_id uuid,
  p_scope_type   text,
  p_scope_id     text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- What a spend block's scope is called right now: the workspace, key or department name, the
  -- member's email, the model's name, or the id itself when it has no name (a provider, or a
  -- key, member, department or model that no longer exists).
  select coalesce(case p_scope_type
    when 'workspace' then (select nullif(btrim(workspace.name), '') from public.workspaces workspace where workspace.id = p_workspace_id)
    when 'key' then (
      select nullif(btrim(key.name), '') from public.keys key
      where key.workspace_id = p_workspace_id and key.id::text = lower(p_scope_id)
    )
    when 'member' then (select nullif(btrim(member.email), '') from auth.users member where member.id::text = lower(p_scope_id))
    when 'department' then (
      select nullif(btrim(department.name), '') from public.workspace_departments department
      where department.workspace_id = p_workspace_id and department.id::text = lower(p_scope_id)
    )
    when 'model' then (select nullif(btrim(model.name), '') from public.v2_models model where model.model_slug = p_scope_id limit 1)
  end, p_scope_id, 'Workspace');
$function$;

COMMENT ON FUNCTION "private"."spend_scope_label"(uuid, text, text) IS 'Display name of a spend rule or block scope (workspace, key or department name, member email, model name, else the id). Used by the spend block event text and lists.';

REVOKE ALL ON FUNCTION "private"."spend_scope_label"(uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_scope_label"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_label"(uuid, text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_scope_label"(uuid, text, text) TO "service_role";
