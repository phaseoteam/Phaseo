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

Add the `plugins` field to Chat Completions, Responses and Messages requests, with the `WebSearchPlugin` (`web`), `WebFetchPlugin` (`web-fetch`) and `ResponseHealingPlugin` (`response-healing`) models, and add `OpenAIWebSearchToolDefinition` to the accepted tool types. These are additions only; no existing type or field is renamed or removed.
