-- Points suggested replacements at what the vendor now recommends, checked
-- against the OpenAI, Gemini API, Vertex, Upstage and other deprecation pages
-- on 2026-10-21. Two kinds of change:
--   * the old target has shut down (or does this week) and nothing serves it,
--     so it is skipped for the end of the vendor's chain;
--   * the vendor names a different model that Phaseo serves.
-- Targets that are deprecated but still served are left alone; the gateway
-- follows up to three approved hops when they retire. Each update is guarded
-- on the replacement seen in prod; history is kept by the
-- catalogue_row_history trigger on public.v2_models.
update public.v2_models m
set replacement_model_slug = c.new_slug
from (values
    -- OpenAI base and completion models: babbage-002, davinci-002 and
    -- gpt-3.5-turbo-instruct shut down 2026-09-28.
    ('openai/ada', 'openai/babbage-002', 'openai/gpt-5.6-terra'),
    ('openai/babbage', 'openai/babbage-002', 'openai/gpt-5.6-terra'),
    ('openai/curie', 'openai/davinci-002', 'openai/gpt-5.6-terra'),
    ('openai/davinci', 'openai/davinci-002', 'openai/gpt-5.6-terra'),
    ('openai/text-ada-001', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    ('openai/text-babbage-001', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    ('openai/text-curie-001', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    ('openai/text-davinci-001', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    ('openai/text-davinci-002', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    ('openai/text-davinci-003', 'openai/gpt-3.5-turbo-instruct', 'openai/gpt-5.6-terra'),
    -- gpt-3.5-turbo, gpt-4-turbo and o4-mini shut down 2026-10-23.
    ('openai/gpt-3.5-turbo-0613', 'openai/gpt-3.5-turbo', 'openai/gpt-5.6-terra'),
    ('openai/gpt-3.5-turbo-16k-0613', 'openai/gpt-3.5-turbo', 'openai/gpt-5.6-terra'),
    ('openai/gpt-4-0125-preview', 'openai/gpt-4-turbo', 'openai/gpt-5.6-sol'),
    ('openai/o1-mini', 'openai/o4-mini', 'openai/gpt-5.6-terra'),
    -- Google names Nano Banana 2.1 for Imagen; Imagen 4 shut down 2026-08-17.
    ('google/imagen-3.0-generate-002', 'google/imagen-4.0-generate-001', 'google/gemini-nano-banana-2.1'),
    ('google/imagen-4.0-fast-generate-001', 'google/gemini-3.1-flash-image', 'google/gemini-nano-banana-2.1'),
    ('google/imagen-4.0-generate-001', 'google/gemini-3.1-flash-image', 'google/gemini-nano-banana-2.1'),
    ('google/imagen-4.0-ultra-generate-001', 'google/gemini-3.1-flash-image', 'google/gemini-nano-banana-2.1'),
    ('google/gemini-3.1-flash-image-preview', 'google/gemini-3.1-flash-image', 'google/gemini-nano-banana-2.1'),
    ('google/gemini-2.5-flash-image', 'google/gemini-3.1-flash-image', 'google/gemini-3.1-flash-lite-image'),
    -- Robotics ER 1.6 preview shut down 2026-08-31.
    ('google/gemini-robotics-er-1.5-preview', 'google/gemini-robotics-er-1.6-preview', 'google/gemini-robotics-er-2-preview'),
    -- The Veo 3.1 previews shut down 2026-10-22; the GA Veo 3.1 models are
    -- served (Gemini Omni Flash, Google's pick, has no route yet).
    ('google/veo-3.0-fast-generate-preview', 'google/veo-3.1-fast-preview', 'google/veo-3.1-fast'),
    ('google/veo-3.0-generate-preview', 'google/veo-3.1-preview', 'google/veo-3.1'),
    -- Solar Pro 3 is deprecated 2026-10-30; Upstage names Solar Pro 4.
    ('upstage/solar-pro-3-2026-01-26', 'upstage/solar-pro-3', 'upstage/solar-pro-4')
  ) as c(model_slug, old_slug, new_slug)
where m.model_slug = c.model_slug
  and m.replacement_model_slug = c.old_slug;
