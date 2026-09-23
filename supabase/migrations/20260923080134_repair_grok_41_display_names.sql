-- Restore the decimal point and hyphenation that were lost when the xAI
-- provider model identifiers were converted into display names.
-- The two rows are distinct API variants, so only their presentation changes.

update public.v2_models
set name = case model_slug
      when 'spacex-ai/grok-4-1-fast-reasoning'
        then 'Grok 4.1 Fast Reasoning'
      when 'spacex-ai/grok-4-1-fast-non-reasoning'
        then 'Grok 4.1 Fast Non-Reasoning'
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'display_name_repaired_at', now(),
      'display_name_repair_source', 'provider_catalogue_import_artifact_audit'
    ),
    updated_at = now()
where model_slug in (
    'spacex-ai/grok-4-1-fast-reasoning',
    'spacex-ai/grok-4-1-fast-non-reasoning'
  )
  and name is distinct from case model_slug
    when 'spacex-ai/grok-4-1-fast-reasoning'
      then 'Grok 4.1 Fast Reasoning'
    when 'spacex-ai/grok-4-1-fast-non-reasoning'
      then 'Grok 4.1 Fast Non-Reasoning'
  end;
