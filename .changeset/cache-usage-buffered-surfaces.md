---
"@phaseo/gateway-api": patch
---

Fix prompt-cache and reasoning usage on non-streaming responses. Buffered Chat, Responses and Messages requests now keep cache reads and 5-minute and 1-hour cache writes when the gateway materialises the upstream stream, so they are billed at the cache rates and reported to the client. `/v1/messages` usage follows Anthropic semantics (`input_tokens` excludes cache reads and writes, reported in `cache_read_input_tokens`, `cache_creation_input_tokens` and `cache_creation`), and Chat usage reports reasoning in `completion_tokens_details.reasoning_tokens` for upstreams that return it there.
