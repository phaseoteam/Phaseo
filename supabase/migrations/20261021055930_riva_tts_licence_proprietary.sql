-- NVIDIA Riva TTS voices are API-only (no downloadable weights, open_weights =
-- false in their metadata). Label them Proprietary so the /models filters put
-- them under Closed weights and the Proprietary licence group.
-- Guarded on the label seen in prod on 2026-10-21; history is kept by the
-- catalogue_row_history trigger on public.v2_models.
update public.v2_models
set license = 'Proprietary'
where model_slug in (
    'nvidia/riva-tts-de-de',
    'nvidia/riva-tts-en-us',
    'nvidia/riva-tts-es-es',
    'nvidia/riva-tts-it-it'
  )
  and license = 'Riva license';
