-- Google lifecycle, checked 2026-10-12 against https://ai.google.dev/gemini-api/docs/deprecations.
-- Four active rows whose shutdown date has already passed are marked retired (the gateway already
-- stops routing them once retired_at is set):
--   gemini-2.5-computer-use-preview (2026-07-28), antigravity-preview-05-2026 (2026-10-05),
--   gemini-2.5-pro-preview-05-06 and gemini-2.5-pro-preview (2025-12-02).
-- Not changed here, on purpose: shutdown dates on that page are the earliest possible dates, so
-- future ones (2026-10-22, 2026-11-17, ...) are not recorded, and Vertex-only retirement dates
-- are not applied to the Gemini API catalogue.

-- Each update is guarded on the values observed during the 2026-10-12 audit, so
-- a newer admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
-- status, catalogue_status (what the public API shows) and retired_at move together in one guarded
-- update, so a row edited after the audit is skipped as a whole instead of ending up half changed.
with fixes (model_slug, old_status, new_status, old_catalogue_status, new_catalogue_status, old_retired_at, new_retired_at) as (
values
  ('google/gemini-2.5-computer-use-preview'::text, 'active'::text, 'retired'::text, 'available'::text, 'retired'::text, null::timestamptz, '2026-07-28T00:00:00Z'::timestamptz),
  ('google/antigravity-preview-05-2026'::text, 'active'::text, 'retired'::text, 'preview'::text, 'retired'::text, null::timestamptz, '2026-10-05T00:00:00Z'::timestamptz),
  ('google/gemini-2.5-pro-preview-05-06'::text, 'active'::text, 'retired'::text, 'available'::text, 'retired'::text, null::timestamptz, '2025-12-02T00:00:00Z'::timestamptz),
  ('google/gemini-2.5-pro-preview'::text, 'active'::text, 'retired'::text, 'available'::text, 'retired'::text, null::timestamptz, '2025-12-02T00:00:00Z'::timestamptz)
), applied as (
  update public.v2_models m
  set status = f.new_status,
      catalogue_status = f.new_catalogue_status,
      retired_at = f.new_retired_at,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.status is not distinct from f.old_status
    and m.catalogue_status is not distinct from f.old_catalogue_status
    and m.retired_at is not distinct from f.old_retired_at
  returning m.model_slug
)
select count(*) as updated_rows, 4 as expected_rows from applied;

-- Google replacement models named explicitly on Google's deprecation pages (high confidence only).
with fixes (model_slug, old_replacement_model_slug, new_replacement_model_slug) as (
values
  ('google/gemini-3.1-flash-live-preview'::text, null::text, 'google/gemini-3.8-live'::text),
  ('google/gemini-2.5-flash-native-audio-preview-2025-12-12'::text, null::text, 'google/gemini-3.8-live'::text),
  ('google/gemini-2.5-computer-use-preview'::text, null::text, 'google/gemini-3.8-flash'::text),
  ('google/antigravity-preview-05-2026'::text, null::text, 'google/antigravity-preview-09-2026'::text),
  ('google/gemini-3.7-flash'::text, null::text, 'google/gemini-3.8-flash'::text),
  ('google/gemini-2.5-pro-preview-05-06'::text, null::text, 'google/gemini-3.1-pro-preview'::text),
  ('google/gemini-2.5-pro-preview'::text, null::text, 'google/gemini-3.1-pro-preview'::text),
  ('google/gemini-3.1-flash-lite-preview'::text, null::text, 'google/gemini-3.1-flash-lite'::text),
  ('google/gemini-robotics-er-1.5-preview'::text, null::text, 'google/gemini-robotics-er-1.6-preview'::text),
  ('google/gemini-2.5-flash-image-preview'::text, null::text, 'google/gemini-nano-banana-2.1'::text),
  ('google/gemini-2.0-flash-preview-image-generation'::text, null::text, 'google/gemini-nano-banana-2.1'::text),
  ('google/imagen-3.0-generate-002'::text, null::text, 'google/imagen-4.0-generate-001'::text),
  ('google/gemini-2.0-flash-live-001'::text, null::text, 'google/gemini-3.8-live'::text),
  ('google/gemini-live-2.5-flash-preview'::text, null::text, 'google/gemini-3.8-live'::text),
  ('google/gemini-2.5-flash-lite-preview-2025-09-25'::text, null::text, 'google/gemini-3.1-flash-lite'::text),
  ('google/gemini-2.5-pro-preview-2025-06-05'::text, null::text, 'google/gemini-3.1-pro-preview'::text),
  ('google/gemini-2.5-pro-preview-2025-05-06'::text, null::text, 'google/gemini-3.1-pro-preview'::text),
  ('google/text-embedding-004'::text, null::text, 'google/gemini-embedding-2'::text),
  ('google/embedding-001'::text, null::text, 'google/gemini-embedding-2'::text),
  ('google/veo-3.0-generate-preview'::text, null::text, 'google/veo-3.1-preview'::text),
  ('google/veo-3.0-fast-generate-preview'::text, null::text, 'google/veo-3.1-fast-preview'::text),
  ('google/text-embedding-gecko-001'::text, null::text, 'google/gemini-embedding-001'::text),
  ('google/text-embedding-gecko-002'::text, null::text, 'google/gemini-embedding-001'::text),
  ('google/text-embedding-gecko-003'::text, null::text, 'google/gemini-embedding-001'::text),
  ('google/text-embedding-gecko-multilingual-001'::text, null::text, 'google/gemini-embedding-001'::text),
  ('google/gemini-1.0-pro-vision-001'::text, null::text, 'google/gemini-2.5-flash'::text),
  ('google/chat-bison'::text, null::text, 'google/gemini-2.5-flash-lite'::text),
  ('google/text-bison'::text, null::text, 'google/gemini-2.5-flash-lite'::text),
  ('google/code-gecko'::text, null::text, 'google/gemini-2.5-flash-lite'::text),
  ('google/image-text'::text, null::text, 'google/gemini-2.5-flash-image'::text),
  ('google/gemini-1.5-pro-001'::text, null::text, 'google/gemini-2.5-flash'::text),
  ('google/gemini-1.5-pro-002'::text, null::text, 'google/gemini-2.5-flash'::text),
  ('google/gemini-1.5-flash-001'::text, null::text, 'google/gemini-2.5-flash-lite'::text),
  ('google/gemini-1.5-flash-002'::text, null::text, 'google/gemini-2.5-flash-lite'::text)
), applied as (
  update public.v2_models m
  set replacement_model_slug = f.new_replacement_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.replacement_model_slug is not distinct from f.old_replacement_model_slug
  returning m.model_slug
)
select count(*) as updated_rows, 34 as expected_rows from applied;
