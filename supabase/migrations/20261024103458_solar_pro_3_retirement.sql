-- Upstage fully deprecates solar-pro3 on 2026-10-30 KST (2026-10-29 15:00
-- UTC) and points users at the solar-pro4 alias
-- (https://console.upstage.ai/docs/models/history, read 2026-10-24). Its only
-- enabled route already ends then, but the model was still active with no
-- replacement, so its requests would fail with nothing to suggest or redirect
-- to. The hourly refresh_model_unserved_since job approves the replacement.
-- Guarded on the state seen in prod on 2026-10-24; history is kept by the
-- catalogue_row_history trigger on public.v2_models.
update public.v2_models
set status = 'deprecated',
  catalogue_status = 'deprecated',
  deprecated_at = '2026-10-24 00:00:00+00',
  retired_at = '2026-10-29 15:00:00+00',
  replacement_model_slug = 'upstage/solar-pro-4'
where model_slug = 'upstage/solar-pro-3'
  and status = 'active'
  and replacement_model_slug is null
  and retired_at is null;
