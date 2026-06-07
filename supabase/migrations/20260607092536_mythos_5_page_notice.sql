insert into public.data_api_model_page_notices (
  api_model_id,
  tone,
  markdown
)
values (
  'anthropic/claude-mythos-5',
  'info',
  'This Anthropic API model ID appears to have leaked ahead of a wider release. AI Stats has added this page in preparation while formal pricing and fuller public documentation remain unconfirmed.'
)
on conflict (api_model_id) do update
set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();
