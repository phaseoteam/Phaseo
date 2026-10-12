-- Deprecate Claude Sonnet 4.5, as announced by Anthropic
-- (https://platform.claude.com/docs/en/about-claude/model-deprecations):
-- deprecated 2026-09-30, retirement 2026-11-30, replacement Claude Sonnet 5.5.
--
-- Side effects, approved by the owner on 2026-10-12:
--   * Customers in workspaces with model deprecation alerts enabled who used this model in
--     the last 30 days receive the standard deprecation email, which names the replacement.
--   * The gateway stops routing this model once retired_at passes (2026-11-30).

-- Each update is guarded on the values observed during the 2026-10-12 audit, so
-- a newer admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
with fixes (model_slug, old_status, new_status, old_deprecated_at, new_deprecated_at, old_retired_at, new_retired_at, old_replacement_model_slug, new_replacement_model_slug) as (
values
  ('anthropic/claude-sonnet-4.5'::text, 'active'::text, 'deprecated'::text, null::timestamptz, '2026-09-30T00:00:00Z'::timestamptz, null::timestamptz, '2026-11-30T00:00:00Z'::timestamptz, null::text, 'anthropic/claude-sonnet-5.5'::text)
), applied as (
  update public.v2_models m
  set status = f.new_status,
      deprecated_at = f.new_deprecated_at,
      retired_at = f.new_retired_at,
      replacement_model_slug = f.new_replacement_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.status is not distinct from f.old_status
    and m.deprecated_at is not distinct from f.old_deprecated_at
    and m.retired_at is not distinct from f.old_retired_at
    and m.replacement_model_slug is not distinct from f.old_replacement_model_slug
  returning m.model_slug
)
select count(*) as updated_rows, 1 as expected_rows from applied;
