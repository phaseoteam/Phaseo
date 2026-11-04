-- Bring Google model lifecycle data in line with the Gemini API deprecation
-- schedule (https://ai.google.dev/gemini-api/docs/deprecations, now served at
-- https://aistudio.google.com/docs/deprecations, read 2026-11-04) and the
-- 2026-11-03 Gemini API announcement of the 2.5 Pro / 2.5 Flash redirects.
--
-- Every update is guarded on the state seen in prod on 2026-11-04, so a row
-- that someone has already corrected is left alone. History is kept by the
-- catalogue_row_history trigger. Retired models with live routes keep serving
-- (see #2884); replacements are approved by the hourly
-- refresh_model_unserved_since job and only redirect once a model is unserved.

-- 1. Gemini 2.5 Pro and 2.5 Flash. From 2026-12-01 Google silently serves
--    gemini-3.8-flash / gemini-3.5-flash-lite behind the old ids and bills at
--    the new model's rates. End our AI Studio routes then, so we never report
--    or bill a different model under the 2.5 id.
update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = '2026-11-03 00:00:00+00',
  retired_at = '2026-12-01 00:00:00+00',
  replacement_model_slug = 'google/gemini-3.8-flash'
where model_slug = 'google/gemini-2.5-pro'
  and status = 'active'
  and retired_at is null
  and replacement_model_slug is null;

update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = '2026-11-03 00:00:00+00',
  retired_at = '2026-12-01 00:00:00+00',
  replacement_model_slug = 'google/gemini-3.5-flash-lite'
where model_slug = 'google/gemini-2.5-flash'
  and status = 'active'
  and retired_at is null
  and replacement_model_slug is null;

update public.v2_model_provider_routes
set effective_to = '2026-12-01 00:00:00+00'
where provider_slug = 'google-ai-studio'
  and model_slug in ('google/gemini-2.5-pro', 'google/gemini-2.5-flash')
  and effective_to is null;

-- 2. Previews that Google shuts down on 2026-11-17: 2.5 TTS (all aliases),
--    3.1 Flash TTS, 2.5 Flash native audio (12-2025) and 3.1 Flash Live.
update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = coalesce(deprecated_at, '2026-11-04 00:00:00+00'),
  retired_at = '2026-11-17 00:00:00+00',
  replacement_model_slug = coalesce(replacement_model_slug, 'google/gemini-3.8-flash-tts')
where model_slug in (
    'google/gemini-2.5-flash-preview-tts',
    'google/gemini-2.5-flash-preview-tts-2025-05-20',
    'google/gemini-2.5-flash-preview-tts-2025-12-10',
    'google/gemini-2.5-pro-preview-tts',
    'google/gemini-2.5-pro-preview-tts-2025-05-20',
    'google/gemini-3.1-flash-tts-preview'
  )
  and status = 'active'
  and retired_at is null;

update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = coalesce(deprecated_at, '2026-11-04 00:00:00+00'),
  retired_at = '2026-11-17 00:00:00+00',
  replacement_model_slug = coalesce(replacement_model_slug, 'google/gemini-3.8-live')
where model_slug in (
    'google/gemini-2.5-flash-native-audio-preview-2025-12-12',
    'google/gemini-3.1-flash-live-preview'
  )
  and status = 'active'
  and retired_at is null;

update public.v2_model_provider_routes
set effective_to = '2026-11-17 00:00:00+00'
where provider_slug = 'google-ai-studio'
  and model_slug in (
    'google/gemini-2.5-flash-preview-tts-2025-12-10',
    'google/gemini-2.5-pro-preview-tts',
    'google/gemini-2.5-flash-native-audio-preview-2025-12-12'
  )
  and effective_to is null;

-- 3. Gemini 2.5 Flash Image is still a stable Gemini API model; Google's
--    earliest shutdown is 2027-03-15 (replacement gemini-3.1-flash-lite-image).
--    We retired it and ended its AI Studio route on 2026-10-02, which turned
--    away requests Google still serves. Its capability, prices and variant are
--    still live, so restoring the route end date is enough to serve it again.
update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = coalesce(deprecated_at, '2026-11-04 00:00:00+00'),
  retired_at = '2027-03-15 00:00:00+00'
where model_slug = 'google/gemini-2.5-flash-image'
  and status = 'retired'
  and retired_at = '2026-10-02 00:00:00+00';

update public.v2_model_provider_routes
set effective_to = '2027-03-15 00:00:00+00'
where provider_slug = 'google-ai-studio'
  and model_slug = 'google/gemini-2.5-flash-image'
  and effective_to = '2026-10-02 00:00:00+00';

-- 4. Models Google has removed from AI Studio whose ids now redirect upstream
--    (3.5 Flash -> 3.6 Flash, 3.7 Flash -> 3.8 Flash). Our AI Studio routes
--    already ended on 2026-10-21/22; Vertex still serves both, so no
--    retirement date is set, but they are deprecated with the named successor.
update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = coalesce(deprecated_at, '2026-10-21 00:00:00+00'),
  replacement_model_slug = coalesce(replacement_model_slug, 'google/gemini-3.6-flash')
where model_slug = 'google/gemini-3.5-flash'
  and status = 'active'
  and retired_at is null;

update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = coalesce(deprecated_at, '2026-10-22 00:00:00+00')
where model_slug = 'google/gemini-3.7-flash'
  and status = 'active'
  and retired_at is null
  and replacement_model_slug = 'google/gemini-3.8-flash';

-- 5. Successors Google names for models with no shutdown date yet. These only
--    take effect if a model later becomes unserved.
update public.v2_models
set replacement_model_slug = 'google/gemini-3.6-flash'
where model_slug = 'google/gemini-3-flash-preview'
  and replacement_model_slug is null;

update public.v2_models
set replacement_model_slug = 'google/gemini-nano-banana-2.1'
where model_slug = 'google/gemini-3.1-flash-image'
  and replacement_model_slug is null;

update public.v2_models
set replacement_model_slug = 'google/lyria-3.5'
where model_slug = 'google/lyria-3-pro-preview'
  and replacement_model_slug is null;

-- 6. Veo. veo-3.1-lite-generate-preview shut down on 2026-10-22 and both of its
--    routes are already closed, but the model was still active. Retired Veo
--    3.0/2.0 GA models had no replacement; Google points Gemini API users at
--    GA Veo models on Vertex, which we serve as veo-3.1 / veo-3.1-fast.
update public.v2_models
set status = 'retired',
  catalogue_status = 'retired',
  deprecated_at = coalesce(deprecated_at, '2026-10-22 00:00:00+00'),
  retired_at = '2026-10-22 00:00:00+00'
where model_slug = 'google/veo-3.1-lite-preview'
  and status = 'active'
  and retired_at is null;

update public.v2_models
set replacement_model_slug = 'google/veo-3.1'
where model_slug in ('google/veo-3', 'google/veo-2')
  and status = 'retired'
  and replacement_model_slug is null;

update public.v2_models
set replacement_model_slug = 'google/veo-3.1-fast'
where model_slug = 'google/veo-3-fast'
  and status = 'retired'
  and replacement_model_slug is null;
