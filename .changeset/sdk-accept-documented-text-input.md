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

Add the newly documented text request and response fields to the generated models: `include_reasoning` and `prediction` on `ChatCompletionsRequest`, `context_management` and `user` on `AnthropicMessagesRequest`, and `context_management` (with `applied_edits`) on `AnthropicMessagesResponse`. `service_tier` on Chat and Responses requests now also accepts `auto`, `scale` and `null`, and `reasoning.effort` accepts `null`. No existing field is renamed or removed. In the Rust and C++ models, `service_tier` and `effort` are now nullable optionals, the same mapping those SDKs already use for other nullable fields such as `prompt_cache_key`.
