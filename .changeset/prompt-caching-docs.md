---
"@phaseo/cpp-sdk": patch
"@phaseo/csharp-sdk": patch
"@phaseo/docs": patch
"@phaseo/go-sdk": patch
"@phaseo/java-sdk": patch
"@phaseo/php-sdk": patch
"@phaseo/py-sdk": patch
"@phaseo/ruby-sdk": patch
"@phaseo/rust-sdk": patch
"@phaseo/sdk": patch
"@phaseo/web": patch
---

Document prompt caching as the gateway now behaves: which providers cache automatically, where each cache control is sent, OpenAI-style usage with `cache_write_tokens`, the input-rate fallback for missing cache prices, and provider affinity. The OpenAPI usage schemas gain `input_tokens_details` / `prompt_tokens_details` with `cached_tokens` and `cache_write_tokens`, and the Anthropic usage schema gains its cache fields, so the generated SDK types include them.
