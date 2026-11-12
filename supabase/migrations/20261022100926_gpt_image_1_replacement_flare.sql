-- OpenAI's deprecations page names gpt-image-2.5-sunburst or
-- gpt-image-2.5-flare for the GPT Image 1 models. Flare is OpenAI's everyday
-- default and Sunburst the premium tier, so all three point at Flare; both
-- are served. Guarded on the replacement seen in prod on 2026-10-22; history
-- is kept by the catalogue_row_history trigger on public.v2_models.
update public.v2_models
set replacement_model_slug = 'openai/gpt-image-2.5-flare'
where model_slug in (
    'openai/gpt-image-1',
    'openai/gpt-image-1-mini',
    'openai/gpt-image-1.5'
  )
  and replacement_model_slug = 'openai/gpt-image-2';
