CREATE OR REPLACE FUNCTION public.save_workspace_baseline_guardrail (
  p_workspace_id uuid,
  p_settings     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Saves the workspace-wide rules (Settings, Privacy and PATCH /v1/control/settings) to the
-- workspace's baseline guardrail in one transaction, creating the baseline and its workspace
-- assignment first when the workspace has none. p_settings holds only the columns to change, named as
-- on workspace_guardrails (allowed_api_model_ids, not model_restriction_model_ids); a key that is
-- missing or null keeps its value. private.sync_workspace_baseline_guardrail copies the result to the
-- workspace_settings columns. Returns the saved baseline row.
declare
  v_id uuid;
  v_unknown text;
  v_row public.workspace_guardrails;
begin
  if p_workspace_id is null or p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_workspace_baseline_settings' using errcode = '22023';
  end if;

  select key into v_unknown
  from jsonb_object_keys(p_settings) as key
  where key not in (
    'privacy_enable_paid_may_train', 'privacy_enable_free_may_train', 'privacy_enable_free_may_publish_prompts',
    'privacy_enable_input_output_logging', 'privacy_zdr_only',
    'provider_restriction_mode', 'provider_restriction_provider_ids', 'provider_restriction_enforce_allowed',
    'model_restriction_mode', 'allowed_api_model_ids')
  limit 1;
  if v_unknown is not null then
    raise exception 'invalid_workspace_baseline_settings'
      using errcode = '22023', detail = format('%s is not a workspace baseline setting.', v_unknown);
  end if;

  v_id := private.ensure_workspace_baseline_guardrail(p_workspace_id);

  update public.workspace_guardrails g set
    privacy_enable_paid_may_train = coalesce((p_settings ->> 'privacy_enable_paid_may_train')::boolean, g.privacy_enable_paid_may_train),
    privacy_enable_free_may_train = coalesce((p_settings ->> 'privacy_enable_free_may_train')::boolean, g.privacy_enable_free_may_train),
    privacy_enable_free_may_publish_prompts = coalesce((p_settings ->> 'privacy_enable_free_may_publish_prompts')::boolean, g.privacy_enable_free_may_publish_prompts),
    privacy_enable_input_output_logging = coalesce((p_settings ->> 'privacy_enable_input_output_logging')::boolean, g.privacy_enable_input_output_logging),
    privacy_zdr_only = coalesce((p_settings ->> 'privacy_zdr_only')::boolean, g.privacy_zdr_only),
    provider_restriction_mode = coalesce(p_settings ->> 'provider_restriction_mode', g.provider_restriction_mode),
    provider_restriction_provider_ids = case
      when jsonb_typeof(p_settings -> 'provider_restriction_provider_ids') = 'array'
        then array(select jsonb_array_elements_text(p_settings -> 'provider_restriction_provider_ids'))
      else g.provider_restriction_provider_ids
    end,
    provider_restriction_enforce_allowed = coalesce((p_settings ->> 'provider_restriction_enforce_allowed')::boolean, g.provider_restriction_enforce_allowed),
    model_restriction_mode = coalesce(p_settings ->> 'model_restriction_mode', g.model_restriction_mode),
    allowed_api_model_ids = case
      when jsonb_typeof(p_settings -> 'allowed_api_model_ids') = 'array'
        then array(select jsonb_array_elements_text(p_settings -> 'allowed_api_model_ids'))
      else g.allowed_api_model_ids
    end,
    updated_at = now()
  where g.id = v_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

COMMENT ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) IS 'Saves the workspace-wide privacy and restriction rules to the workspace baseline guardrail, creating it (and its workspace assignment) if missing, in one transaction. Mirrored to workspace_settings by a trigger. Service role only.';

GRANT EXECUTE ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_workspace_baseline_guardrail"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
