-- Anthropic lifecycle data, checked 2026-10-12 against Anthropic's model pages and
-- https://platform.claude.com/docs/en/about-claude/models/overview and /model-deprecations.
-- Only fills missing fields; no status changes, so no customer notifications are affected.
-- Not touched: Claude Mythos Preview deprecated_at (status is already deprecated; adding a
-- date would change the notification dedupe key).

-- Anthropic lifecycle: replacement slugs for retired Claude models (from Anthropic's deprecations table).

-- Each update is guarded on the values observed during the 2026-10-12 audit, so
-- a newer admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
with fixes (model_slug, old_replacement_model_slug, new_replacement_model_slug) as (
values
  ('anthropic/claude-opus-4'::text, null::text, 'anthropic/claude-opus-4.8'::text),
  ('anthropic/claude-sonnet-4'::text, null::text, 'anthropic/claude-sonnet-5.5'::text),
  ('anthropic/claude-3.7-sonnet'::text, null::text, 'anthropic/claude-sonnet-5.5'::text),
  ('anthropic/claude-3.5-haiku'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-3-haiku'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-3.5-sonnet-2024-06-20'::text, null::text, 'anthropic/claude-sonnet-5.5'::text),
  ('anthropic/claude-3.5-sonnet-2024-10-22'::text, null::text, 'anthropic/claude-sonnet-5.5'::text),
  ('anthropic/claude-3-opus'::text, null::text, 'anthropic/claude-opus-4.8'::text),
  ('anthropic/claude-3-sonnet'::text, null::text, 'anthropic/claude-sonnet-5.5'::text),
  ('anthropic/claude-2.0'::text, null::text, 'anthropic/claude-opus-4.8'::text),
  ('anthropic/claude-2.1'::text, null::text, 'anthropic/claude-opus-4.8'::text),
  ('anthropic/claude-1.0'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-1.1'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-1.2'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-1.3'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-instant-1.0'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-instant-1.1'::text, null::text, 'anthropic/claude-haiku-4.5'::text),
  ('anthropic/claude-instant-1.2'::text, null::text, 'anthropic/claude-haiku-4.5'::text)
), applied as (
  update public.v2_models m
  set replacement_model_slug = f.new_replacement_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.replacement_model_slug is not distinct from f.old_replacement_model_slug
  returning m.model_slug
)
select count(*) as updated_rows, 18 as expected_rows from applied;

-- Claude Mythos 5.1 release date (Anthropic model page).
with fixes (model_slug, old_released_at, new_released_at) as (
values
  ('anthropic/claude-mythos-5.1'::text, null::timestamptz, '2026-09-01T00:00:00Z'::timestamptz)
), applied as (
  update public.v2_models m
  set released_at = f.new_released_at,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.released_at is not distinct from f.old_released_at
  returning m.model_slug
)
select count(*) as updated_rows, 1 as expected_rows from applied;

-- Claude Sonnet 5.5 predecessor.
with fixes (model_slug, old_previous_model_slug, new_previous_model_slug) as (
values
  ('anthropic/claude-sonnet-5.5'::text, null::text, 'anthropic/claude-sonnet-5'::text)
), applied as (
  update public.v2_models m
  set previous_model_slug = f.new_previous_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.previous_model_slug is not distinct from f.old_previous_model_slug
  returning m.model_slug
)
select count(*) as updated_rows, 1 as expected_rows from applied;
