---
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

Add the optional `cost` (US dollars) and `cost_details` fields to `Usage` and `AnthropicUsage`, and the new `UsageCostDetails` model with `upstream_inference_cost`, so typed clients can read the request cost the gateway now reports on Chat Completions, Responses, Messages and embeddings responses.

`ApiKeyWithValueResponse` gains `key`, the new key's secret at the top level, the same value as `data.key`. The gateway always returns it from `POST /v1/keys`. Nothing is renamed or removed. In the Rust SDK, code that builds an `ApiKeyWithValueResponse` with a struct literal now needs to set `key` too.
