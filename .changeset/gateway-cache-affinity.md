---
"@phaseo/docs": patch
"@phaseo/gateway-api": patch
---

Keep agent turns on the provider that holds their prompt cache. Requests with `prompt_cache_key`, `session_id` or a `cache_control` opt-in now pin to the provider and route that served their first successful step, read the pin synchronously on a cold isolate, skip recovery probes while pinned, and keep the pin for as long as the provider's cache retention. Pins move only on provider failure or exhausted managed quota, and the reason is recorded in routing diagnostics.

Send a workspace-scoped hash of `prompt_cache_key` upstream instead of the raw key (derived from `session_id` when no key is given), and never send `prompt_cache_key: null`. Fireworks now uses Chat Completions (which reports cached tokens) with `x-session-affinity`, `user` and `store: false` on Responses; Cloudflare Workers AI receives `x-session-affinity`; xAI falls back to the hashed key for `x-grok-conv-id` and maps `provider_options.xai.conversation_id` on Responses. A top-level `prompt_cache_retention` now takes precedence over `provider_options.openai.prompt_cache_retention`.
