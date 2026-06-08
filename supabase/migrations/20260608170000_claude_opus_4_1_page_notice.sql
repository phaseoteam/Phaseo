insert into public.data_api_model_page_notices (
  api_model_id,
  tone,
  markdown
)
values (
  'anthropic/claude-opus-4.1',
  'warning',
  'Anthropic deprecated `claude-opus-4-1-20250805` on June 5, 2026 and plans to retire it on August 5, 2026. New integrations should move to [`anthropic/claude-opus-4.8`](/anthropic/claude-opus-4.8). If you still run Opus 4.1 traffic, use the [Opus 4.1 to 4.8 migration guide](/docs/v1/model-migrations/anthropic-claude-opus-4-1-to-4-8).'
)
on conflict (api_model_id) do update
set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();
