-- Add per-version model families for Claude 5.x/4.7/4.8 and GPT 6/6.1, and assign models.
--
-- One model family per release version, matching the existing convention
-- (anthropic/claude-4.6, openai/gpt-5.6, google/gemini-3.1, ...).
--   anthropic/claude-5.5  : Opus 5.5, Sonnet 5.5, Haiku 5.5
--   anthropic/claude-5.1  : Fable 5.1, Mythos 5.1
--   anthropic/claude-5    : Opus 5
--   anthropic/claude-4.7 / claude-4.8 : Opus 4.7 / Opus 4.8
--   openai/gpt-6          : the Sol, Luna and Astra models (and their Pro variants)
--   openai/gpt-6.1        : GPT 6.1 Sol and Sol Pro
-- v2_models.family_slug is plain text (no FK), so the family rows are inserted first.
insert into public.v2_model_families (family_slug, lab_slug, name, metadata)
values
  ('anthropic/claude-5.5', 'anthropic', 'Claude 5.5', '{"source":"admin"}'::jsonb),
  ('anthropic/claude-5.1', 'anthropic', 'Claude 5.1', '{"source":"admin"}'::jsonb),
  ('anthropic/claude-4.7', 'anthropic', 'Claude 4.7', '{"source":"admin"}'::jsonb),
  ('anthropic/claude-4.8', 'anthropic', 'Claude 4.8', '{"source":"admin"}'::jsonb),
  ('openai/gpt-6', 'openai', 'GPT 6', '{"source":"admin"}'::jsonb),
  ('openai/gpt-6.1', 'openai', 'GPT 6.1', '{"source":"admin"}'::jsonb)
on conflict (family_slug) do nothing;

-- Each update is guarded on the values observed during the 2026-10-12 audit, so
-- a newer admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
with fixes (model_slug, old_family_slug, new_family_slug) as (
values
  ('anthropic/claude-opus-5.5'::text, null::text, 'anthropic/claude-5.5'::text),
  ('anthropic/claude-sonnet-5.5'::text, 'anthropic/claude-5'::text, 'anthropic/claude-5.5'::text),
  ('anthropic/claude-haiku-5.5'::text, 'anthropic/claude-5'::text, 'anthropic/claude-5.5'::text),
  ('anthropic/claude-fable-5.1'::text, 'anthropic/claude-5'::text, 'anthropic/claude-5.1'::text),
  ('anthropic/claude-mythos-5.1'::text, 'anthropic/claude-5'::text, 'anthropic/claude-5.1'::text),
  ('anthropic/claude-opus-5'::text, null::text, 'anthropic/claude-5'::text),
  ('anthropic/claude-opus-4.7'::text, null::text, 'anthropic/claude-4.7'::text),
  ('anthropic/claude-opus-4.8'::text, null::text, 'anthropic/claude-4.8'::text),
  ('openai/gpt-6-sol'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6-sol-pro'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6-luna'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6-luna-pro'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6-astra'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6-astra-pro'::text, null::text, 'openai/gpt-6'::text),
  ('openai/gpt-6.1-sol'::text, null::text, 'openai/gpt-6.1'::text),
  ('openai/gpt-6.1-sol-pro'::text, null::text, 'openai/gpt-6.1'::text)
), applied as (
  update public.v2_models m
  set family_slug = f.new_family_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.family_slug is not distinct from f.old_family_slug
  returning m.model_slug
)
select count(*) as updated_rows, 16 as expected_rows from applied;
