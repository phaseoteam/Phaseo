-- Remove the former TypeSafe public ID as a Kev-4B compatibility alias.
-- Alias rows are retained as disabled records for catalogue history.
begin;

update public.v2_model_aliases
set enabled = false,
    effective_to = coalesce(effective_to, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'notes', 'Disabled at user request; the former TypeSafe ID no longer resolves to Kev-4B.'
    ),
    updated_at = now()
where alias_slug = 'typesafe/kev-4b'
  and model_slug = 'jaredpalmer/kev-4b';

update public.v2_models
set metadata = coalesce(metadata, '{}'::jsonb) - 'legacy_ids',
    updated_at = now()
where model_slug = 'jaredpalmer/kev-4b'
  and metadata ? 'legacy_ids';

commit;
