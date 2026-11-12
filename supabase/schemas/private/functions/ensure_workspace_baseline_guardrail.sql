CREATE OR REPLACE FUNCTION private.ensure_workspace_baseline_guardrail (
  p_workspace_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The workspace's baseline guardrail, created on first use: an access guardrail holding the
-- workspace-wide rules the Privacy page edits, assigned to the whole workspace. A new baseline starts
-- from the workspace_settings privacy and restriction columns (defaults when there is no row), so
-- creating it never changes what the gateway enforces. Safe under concurrent first saves: the
-- partial unique index allows one baseline per workspace, and the loser of a race reads the winner's.
declare
  v_id uuid;
begin
  select g.id into v_id
  from public.workspace_guardrails g
  where g.workspace_id = p_workspace_id
    and g.is_workspace_baseline;

  if v_id is null then
    insert into public.workspace_guardrails (
      workspace_id, name, description, kind, enabled, is_workspace_baseline,
      privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging, privacy_zdr_only,
      provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed,
      model_restriction_mode, allowed_api_model_ids)
    select
      p_workspace_id, 'Workspace baseline', 'Workspace-wide data and routing rules, set under Settings, Privacy.', 'access', true, true,
      coalesce(s.privacy_enable_paid_may_train, true), coalesce(s.privacy_enable_free_may_train, true),
      coalesce(s.privacy_enable_free_may_publish_prompts, true), coalesce(s.privacy_enable_input_output_logging, true),
      coalesce(s.privacy_zdr_only, false),
      coalesce(s.provider_restriction_mode, 'none'), coalesce(s.provider_restriction_provider_ids, '{}'),
      coalesce(s.provider_restriction_enforce_allowed, false),
      coalesce(s.model_restriction_mode, 'none'), coalesce(s.model_restriction_model_ids, '{}')
    from (select 1) as one
    left join public.workspace_settings s on s.workspace_id = p_workspace_id
    on conflict (workspace_id) where is_workspace_baseline do nothing
    returning id into v_id;

    if v_id is null then
      select g.id into v_id
      from public.workspace_guardrails g
      where g.workspace_id = p_workspace_id
        and g.is_workspace_baseline;
    end if;
  end if;

  insert into public.workspace_guardrail_assignments (workspace_id, guardrail_id, target_type, target_id)
  values (p_workspace_id, v_id, 'workspace', null)
  on conflict do nothing;

  return v_id;
end;
$function$;

COMMENT ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) IS 'Returns the workspace''s baseline guardrail, creating it (from the workspace_settings privacy and restriction columns) and its workspace assignment when missing.';

REVOKE ALL ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."ensure_workspace_baseline_guardrail"(uuid) TO "postgres";
