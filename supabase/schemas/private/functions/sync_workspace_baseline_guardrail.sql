CREATE OR REPLACE FUNCTION private.sync_workspace_baseline_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Keeps a workspace's baseline guardrail and the privacy and restriction columns of its
-- workspace_settings row equal, in both directions, while those columns still exist (dropping them is
-- a later, separately confirmed step). The gateway reads the baseline; older code may still read or
-- write the columns:
-- * workspace_guardrails (the baseline changed): copy its values to workspace_settings, creating the
--   row if needed. allowed_api_model_ids is stored there as model_restriction_model_ids.
-- * workspace_settings (code that still writes the columns): copy the values to the baseline, and
--   create the baseline when the workspace has none and the values restrict anything.
-- Each direction writes only values that differ, so the write it causes in the other table changes
-- nothing there and the pair settles after one hop.
begin
  if tg_table_name = 'workspace_guardrails' then
    insert into public.workspace_settings as s (
      workspace_id,
      privacy_enable_paid_may_train, privacy_enable_free_may_train, privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging, privacy_zdr_only,
      provider_restriction_mode, provider_restriction_provider_ids, provider_restriction_enforce_allowed,
      model_restriction_mode, model_restriction_model_ids)
    values (
      new.workspace_id,
      new.privacy_enable_paid_may_train, new.privacy_enable_free_may_train, new.privacy_enable_free_may_publish_prompts,
      new.privacy_enable_input_output_logging, new.privacy_zdr_only,
      new.provider_restriction_mode, new.provider_restriction_provider_ids, new.provider_restriction_enforce_allowed,
      new.model_restriction_mode, new.allowed_api_model_ids)
    on conflict (workspace_id) do update set
      privacy_enable_paid_may_train = excluded.privacy_enable_paid_may_train,
      privacy_enable_free_may_train = excluded.privacy_enable_free_may_train,
      privacy_enable_free_may_publish_prompts = excluded.privacy_enable_free_may_publish_prompts,
      privacy_enable_input_output_logging = excluded.privacy_enable_input_output_logging,
      privacy_zdr_only = excluded.privacy_zdr_only,
      provider_restriction_mode = excluded.provider_restriction_mode,
      provider_restriction_provider_ids = excluded.provider_restriction_provider_ids,
      provider_restriction_enforce_allowed = excluded.provider_restriction_enforce_allowed,
      model_restriction_mode = excluded.model_restriction_mode,
      model_restriction_model_ids = excluded.model_restriction_model_ids,
      updated_at = now()
    where (
      s.privacy_enable_paid_may_train, s.privacy_enable_free_may_train, s.privacy_enable_free_may_publish_prompts,
      s.privacy_enable_input_output_logging, s.privacy_zdr_only,
      s.provider_restriction_mode, s.provider_restriction_provider_ids, s.provider_restriction_enforce_allowed,
      s.model_restriction_mode, s.model_restriction_model_ids
    ) is distinct from (
      excluded.privacy_enable_paid_may_train, excluded.privacy_enable_free_may_train, excluded.privacy_enable_free_may_publish_prompts,
      excluded.privacy_enable_input_output_logging, excluded.privacy_zdr_only,
      excluded.provider_restriction_mode, excluded.provider_restriction_provider_ids, excluded.provider_restriction_enforce_allowed,
      excluded.model_restriction_mode, excluded.model_restriction_model_ids
    );
    return null;
  end if;

  -- workspace_settings
  update public.workspace_guardrails g set
    privacy_enable_paid_may_train = new.privacy_enable_paid_may_train,
    privacy_enable_free_may_train = new.privacy_enable_free_may_train,
    privacy_enable_free_may_publish_prompts = new.privacy_enable_free_may_publish_prompts,
    privacy_enable_input_output_logging = new.privacy_enable_input_output_logging,
    privacy_zdr_only = new.privacy_zdr_only,
    provider_restriction_mode = new.provider_restriction_mode,
    provider_restriction_provider_ids = new.provider_restriction_provider_ids,
    provider_restriction_enforce_allowed = new.provider_restriction_enforce_allowed,
    model_restriction_mode = new.model_restriction_mode,
    allowed_api_model_ids = new.model_restriction_model_ids,
    updated_at = now()
  where g.workspace_id = new.workspace_id
    and g.is_workspace_baseline
    and (
      g.privacy_enable_paid_may_train, g.privacy_enable_free_may_train, g.privacy_enable_free_may_publish_prompts,
      g.privacy_enable_input_output_logging, g.privacy_zdr_only,
      g.provider_restriction_mode, g.provider_restriction_provider_ids, g.provider_restriction_enforce_allowed,
      g.model_restriction_mode, g.allowed_api_model_ids
    ) is distinct from (
      new.privacy_enable_paid_may_train, new.privacy_enable_free_may_train, new.privacy_enable_free_may_publish_prompts,
      new.privacy_enable_input_output_logging, new.privacy_zdr_only,
      new.provider_restriction_mode, new.provider_restriction_provider_ids, new.provider_restriction_enforce_allowed,
      new.model_restriction_mode, new.model_restriction_model_ids
    );

  if not found
    and not (
      new.privacy_enable_paid_may_train and new.privacy_enable_free_may_train
      and new.privacy_enable_free_may_publish_prompts and new.privacy_enable_input_output_logging
      and not new.privacy_zdr_only
      and new.provider_restriction_mode = 'none' and not new.provider_restriction_enforce_allowed
      and new.model_restriction_mode = 'none')
    and not exists (
      select 1 from public.workspace_guardrails g
      where g.workspace_id = new.workspace_id and g.is_workspace_baseline)
  then
    perform private.ensure_workspace_baseline_guardrail(new.workspace_id);
  end if;
  return null;
end;
$function$;

COMMENT ON FUNCTION "private"."sync_workspace_baseline_guardrail"() IS 'Keeps the workspace baseline guardrail and the workspace_settings privacy and restriction columns equal in both directions, creating the baseline when older code saves restricting values for a workspace without one.';

REVOKE ALL ON FUNCTION "private"."sync_workspace_baseline_guardrail"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."sync_workspace_baseline_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_workspace_baseline_guardrail"() TO "postgres";
