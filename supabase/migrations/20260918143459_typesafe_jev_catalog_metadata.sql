-- Align TypeSafe Jev with the current upstream model catalogue.
-- Jev 1.13 was released on 2026-09-10 and accepts text input while returning
-- structured decision output. Keep the model and provider route in sync.

update public.v2_models
set input_modalities = array['text']::text[],
    output_modalities = array['decisions']::text[],
    released_at = '2026-09-10T00:00:00Z'::timestamptz,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'upstream_release_date', '2026-09-10',
        'release_date_source', 'https://api.typesafe.ai/v1/models'
      ),
    updated_at = now()
where model_slug = 'typesafe/jev';

update public.v2_model_provider_routes
set input_modalities = array['text']::text[],
    output_modalities = array['decisions']::text[],
    updated_at = now()
where provider_model_id = 'typesafe:typesafe/jev:systemone';
