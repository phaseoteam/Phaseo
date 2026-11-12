---
"@phaseo/gateway-api": patch
---

Streamed responses now name the Phaseo model the request resolved to on every event, matching the non-streamed body. Before this, Responses events (`response.created`, `response.in_progress`, `response.completed`), Chat Completions chunks and the Messages `message_start` could carry the provider's own model id, such as `gpt-6-luna` or `claude-sonnet-5-5`, instead of `openai/gpt-6-luna` or `anthropic/claude-sonnet-5.5`. Non-streamed Chat Completions and Messages bodies use the same Phaseo id.
