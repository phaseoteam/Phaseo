-- OpenAI's chat-latest is not GPT-6 Luna. OpenAI documents it as "the latest Instant
-- model currently used in ChatGPT", repointed regularly and priced at $5 input /
-- $0.50 cached / $30 output per million tokens. 20260923165434_catalogue_quality_cleanup
-- moved its routes onto openai/gpt-6-luna, so from 2026-09-26 the gateway sent 256 of
-- 465 GPT-6 Luna requests on OpenAI to chat-latest, billing customers Luna's price
-- ($0.10 / $0.50) for a different model that OpenAI bills at chat-latest's price. The
-- moved routes also put chat-latest's prices on GPT-6 Luna's model page.
--
-- Move those routes, and with them their SKUs, back to openai/chat-latest, and stop
-- routing to OpenAI's chat-latest upstream. GPT-6 Luna keeps its own OpenAI
-- (gpt-6-luna) and Inference.net routes. The alias rows that send openai/chat-latest
-- requests to GPT-6 Luna are left as they are.
--
-- Each update is guarded on the state the cleanup left, so a route changed since then
-- is not touched.

update public.v2_model_provider_routes
set
  model_slug = 'openai/chat-latest',
  routing_enabled = case when provider_slug = 'openai' then false else routing_enabled end,
  updated_at = now()
where model_slug = 'openai/gpt-6-luna'
  and (
    (provider_slug in ('openai', 'openai-eu') and provider_model_slug = 'chat-latest')
    or (provider_slug in ('kilo', 'nano-gpt', 'openrouter') and provider_model_slug = 'openai/gpt-chat-latest')
    or (provider_slug = 'zenmux' and provider_model_slug = 'openai/chat-latest')
  );
