---
"@phaseo/gateway-api": patch
---

Return client errors as client errors. Embeddings input with nested objects (for example `{"text": {"nested": true}}`) is now rejected up front with a 400 `validation_error`; flat field objects for prompt templates and `{ content: [...] }` multimodal input still pass. When every provider rejects a request with the same 400, 413 or 422, the gateway now returns that status with the provider's message instead of a 502. The API key spend-limit message now shows dollars ("$0.0117 of $0.01") instead of raw nanos, and its `Retry-After` header is no longer dropped when the limit resets more than 24 hours away.
