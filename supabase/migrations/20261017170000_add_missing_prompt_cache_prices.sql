-- Add prompt-cache price rows that active routes were missing, from official provider pricing.
--
-- A cache hit or write on a route without a matching row made the gateway's pricing throw
-- (pricing_rule_missing): streams went unbilled and buffered requests returned 500 after the
-- provider had charged. The gateway now falls back to the input rate and logs it; these rows
-- restore the provider's documented rate where one is published.
--
-- Each row is a ratio of the SKU's own standard input meter, so long-context tiers and
-- regional uplifts carry over. Ratio 1 encodes "no cache discount" where the provider says
-- cached tokens bill at the standard rate (OpenAI "-pro", Together, Cerebras).
-- Idempotent: rows are only added where the SKU has no meter of that key.

create temporary table _prompt_cache_prices (
  provider_model_id text not null,
  meter_key text not null,
  input_ratio numeric not null,
  source_url text not null,
  note text not null
) on commit drop;

insert into _prompt_cache_prices values
  ('google-ai-studio:google/gemma-4-26b-a4b:free', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-ai-studio:google/gemma-4-31b:free', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-ai-studio:google/gemini-3.1-pro-preview', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-ai-studio:google/gemini-3.1-pro-preview-customtools', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-ai-studio:google/gemini-3-flash-preview', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-ai-studio:google/gemini-3.1-flash-lite', 'cached_read_text_tokens', 0.1, 'https://ai.google.dev/gemini-api/docs/pricing', 'Gemini Developer API context caching price: 10% of the standard input price (official pricing page, accessed 2026-10-17).'),
  ('google-vertex:google/gemini-3.1-pro-preview', 'cached_read_text_tokens', 0.1, 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview', 'Vertex AI implicit caching: "a 90% discount on cached tokens compared to standard input tokens" (accessed 2026-10-17).'),
  ('google-vertex:google/gemini-3.1-flash-lite', 'cached_read_text_tokens', 0.1, 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview', 'Vertex AI implicit caching: "a 90% discount on cached tokens compared to standard input tokens" (accessed 2026-10-17).'),
  ('google-vertex-eu:google/gemini-3.1-flash-lite', 'cached_read_text_tokens', 0.1, 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview', 'Vertex AI implicit caching: "a 90% discount on cached tokens compared to standard input tokens" (accessed 2026-10-17).'),
  ('openai:openai/gpt-5.5-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/gpt-5.4-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/gpt-5.2-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/gpt-5-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/o3-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/o1-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/gpt-4o-2024-05-13', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/gpt-4-2023-06-13', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/davinci-002', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai:openai/babbage-002', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai-eu:openai/gpt-5.4-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('openai-eu:openai/gpt-5.5-pro', 'cached_read_text_tokens', 1, 'https://developers.openai.com/api/docs/pricing', 'OpenAI lists no cached-input price ("-") for this model, so cached tokens bill at the standard input rate (accessed 2026-10-17).'),
  ('together:cogito/cogito-671b-v2.1', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:essential-ai/rnj-1', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:google/gemma-4-31b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:liquid-ai/lfm-2-24b-a2b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:liquid-ai/lfm-2.5-8b-a1b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:meta/llama-3.3-70b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:openai/gpt-oss-120b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:openai/gpt-oss-20b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:qwen/qwen2.5-7b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:qwen/qwen3.5-9b', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:qwen/qwen3.6-plus', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:qwen/qwen3.7-plus', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:qwen/qwen3.8-flash', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('together:thinking-machines/inkling-small', 'cached_read_text_tokens', 1, 'https://docs.together.ai/docs/inference/chat/prompt-caching', 'Together: "Models without a cached input price bill every input token at the standard rate" (accessed 2026-10-17).'),
  ('cerebras:google/gemma-4-31b', 'cached_read_text_tokens', 1, 'https://inference-docs.cerebras.ai/capabilities/prompt-caching', 'Cerebras: cached input tokens are billed at the standard input rate; caching adds no fee (accessed 2026-10-17).'),
  ('cerebras:qwen/qwen3.8-27b', 'cached_read_text_tokens', 1, 'https://inference-docs.cerebras.ai/capabilities/prompt-caching', 'Cerebras: cached input tokens are billed at the standard input rate; caching adds no fee (accessed 2026-10-17).'),
  ('mistral:mistral/devstral-2', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/devstral-medium-1.0', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/devstral-small-1.1', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/devstral-small-2', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/devstral-small-2:free', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/leanstral-1.5:free', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/leanstral:free', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/magistral-medium-1.2', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/magistral-small-1.2', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-large-2.1', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-medium-3.0', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-medium-3.1', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-nemo-12b', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-small-3.2', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/mistral-small-creative', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('mistral:mistral/pixtral-large', 'cached_read_text_tokens', 0.1, 'https://docs.mistral.ai/studio-api/conversations/advanced/prompt-caching', 'Mistral: cached prompt tokens are billed at 10% of the standard input token price (accessed 2026-10-17).'),
  ('sambanova:minimax/minimax-m3', 'cached_read_text_tokens', 0.1, 'https://cloud.sambanova.ai/plans/pricing', 'SambaCloud MiniMax-M3 cached input: $0.06 per 1M tokens, 10% of the $0.60 input price (accessed 2026-10-17).'),
  ('sambanova:minimax/minimax-m3', 'cached_write_text_tokens', 1, 'https://cloud.sambanova.ai/plans/pricing', 'SambaCloud cache_creation_tokens are informational and carry no extra charge: billed at the input rate (accessed 2026-10-17).'),
  ('moonshotai:moonshotai/kimi-k3', 'cached_write_text_tokens_5m', 1, 'https://platform.kimi.ai/docs/pricing/chat-k3', 'Kimi K3 5-minute cache write: $3.00 per 1M tokens, equal to the input price (accessed 2026-10-17).'),
  ('moonshotai:moonshotai/kimi-k3', 'cached_write_text_tokens_1h', 2, 'https://platform.kimi.ai/docs/pricing/chat-k3', 'Kimi K3 1-hour cache write: $6.00 per 1M tokens, 2x the input price (accessed 2026-10-17).'),
  ('anthropic-aws:anthropic/claude-sonnet-5', 'cached_write_text_tokens_1h', 2, 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching', 'Anthropic: 1-hour cache write tokens are 2 times the base input price; multipliers stack with data residency (accessed 2026-10-17).'),
  ('anthropic-aws-us:anthropic/claude-sonnet-5', 'cached_write_text_tokens_1h', 2, 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching', 'Anthropic: 1-hour cache write tokens are 2 times the base input price; multipliers stack with data residency (accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-opus-5', 'cached_write_text_tokens_5m', 1.25, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude 5-minute cache write: 1.25x the standard input price (AWS, accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-opus-4.8', 'cached_write_text_tokens_5m', 1.25, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude 5-minute cache write: 1.25x the standard input price (AWS, accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-opus-5', 'cached_write_text_tokens_1h', 2, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude 1-hour cache write: 2x the standard input price (AWS, accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-opus-4.8', 'cached_write_text_tokens_1h', 2, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude 1-hour cache write: 2x the standard input price (AWS, accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-3.7-sonnet', 'cached_read_text_tokens', 0.1, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude cache read: 0.1x the standard input price (AWS, accessed 2026-10-17).'),
  ('amazon-bedrock:anthropic/claude-3.7-sonnet', 'cached_write_text_tokens', 1.25, 'https://aws.amazon.com/blogs/machine-learning/optimizing-cost-and-latency-with-amazon-bedrock-prompt-caching/', 'Amazon Bedrock Claude 3.7 Sonnet cache write (5-minute TTL only): 1.25x the standard input price (AWS, accessed 2026-10-17).');

insert into public.v2_pricing_sku_meters (
  sku_meter_id, sku_id, meter_key, modality, direction, unit, unit_quantity,
  price_nanos, display_label, display_unit, billable, meter_order, metadata
)
select
  gen_random_uuid(),
  sku.sku_id,
  price.meter_key,
  input_meter.modality,
  'input',
  input_meter.unit,
  input_meter.unit_quantity,
  round(input_meter.price_nanos * price.input_ratio, 6),
  case price.meter_key
    when 'cached_read_text_tokens' then 'Cached input text tokens'
    when 'cached_write_text_tokens' then 'Cache write text tokens'
    when 'cached_write_text_tokens_5m' then 'Cache write text tokens (5 minutes)'
    when 'cached_write_text_tokens_1h' then 'Cache write text tokens (1 hour)'
  end,
  input_meter.display_unit,
  true,
  input_meter.meter_order + case price.meter_key
    when 'cached_read_text_tokens' then 1
    when 'cached_write_text_tokens' then 2
    when 'cached_write_text_tokens_5m' then 3
    else 4
  end,
  (input_meter.metadata - 'source' - 'source_url' - 'note' - 'accessed_at') || jsonb_build_object(
    'source', 'official_provider_pricing',
    'source_url', price.source_url,
    'note', price.note,
    'accessed_at', '2026-10-17T00:00:00Z',
    'derived_from_meter', 'input_text_tokens',
    'input_ratio', price.input_ratio
  )
from _prompt_cache_prices price
join public.v2_pricing_skus sku
  on sku.provider_model_id = price.provider_model_id
 and sku.operation = 'text.generate'
 and sku.status = 'active'
 -- Standard SKUs only (and $0 free SKUs): other tiers keep the input-rate fallback until
 -- their cache rates are confirmed.
 and coalesce(sku.service_tier_slug, 'standard') in ('standard', 'free')
join public.v2_pricing_sku_meters input_meter
  on input_meter.sku_id = sku.sku_id
 and input_meter.meter_key = 'input_text_tokens'
where not exists (
  select 1
  from public.v2_pricing_sku_meters existing
  where existing.sku_id = sku.sku_id
    and existing.meter_key = price.meter_key
)
on conflict (sku_id, meter_key) do nothing;

-- OVHcloud AI Endpoints documents no prompt-cache discount, so its $0 cache rows gave cache
-- hits away. Bill them at the input rate instead.
update public.v2_pricing_sku_meters cache_meter
set
  price_nanos = input_meter.price_nanos,
  metadata = cache_meter.metadata || jsonb_build_object(
    'source', 'official_provider_pricing',
    'source_url', 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/',
    'note', 'OVHcloud AI Endpoints documents no prompt-cache discount; cached tokens bill at the input rate (accessed 2026-10-17). Previously $0.',
    'accessed_at', '2026-10-17T00:00:00Z'
  ),
  updated_at = now()
from public.v2_pricing_skus sku
join public.v2_pricing_sku_meters input_meter
  on input_meter.sku_id = sku.sku_id
 and input_meter.meter_key = 'input_text_tokens'
where cache_meter.sku_id = sku.sku_id
  and sku.provider_model_id like 'ovhcloud:%'
  and sku.operation = 'text.generate'
  and cache_meter.meter_key in ('cached_read_text_tokens', 'cached_write_text_tokens')
  and cache_meter.price_nanos = 0
  and input_meter.price_nanos > 0;
