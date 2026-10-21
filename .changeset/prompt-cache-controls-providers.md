---
"@phaseo/gateway-api": patch
"@phaseo/sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/go-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/cpp-sdk": patch
---

Send more providers the prompt-cache controls they document:

- `/v1/messages` accepts `prompt_cache_key`, as Chat Completions and Responses do, instead of returning 400.
- Moonshot AI receives `prompt_cache_options` (`mode: "implicit"`, `ttl` `5m` or `1h`). A `1h` lifetime is sent only to Kimi K3 routes priced for 1-hour writes, and those writes are billed at the 1-hour rate; elsewhere it is removed and reported in `X-Phaseo-Dropped-Params`.
- Inference.net's Claude and Gemini 2.5 models receive block `cache_control`, without a `ttl`, so they can write and read a prompt cache.
- Baseten receives the cache key in `x-session-affinity`, and Morph in `x-session-id`.
- xAI receives the cache key derived from `session_id` in the request body.
- On Vertex AI, `provider_options.google.cached_content` now requires your own Vertex AI credential and returns 400 with Phaseo's, as on Google AI Studio.
