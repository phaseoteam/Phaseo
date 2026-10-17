---
"@phaseo/gateway-api": patch
"@phaseo/docs": patch
---

Keep Anthropic default cache policies within Anthropic's limit of four cache breakpoints per request, counting any `cache_control` the caller set, and add an `agent` scope (alias `conversation`) for tool loops. `agent` marks the last tool definition, the system prompt, the last block of the final turn (including `tool_result` and `tool_use` blocks) and the previous step's turn. `all_text` now marks the system prompt and the last block of the three most recent user messages with text or images, instead of every user block. Unknown scopes use `agent` instead of marking every user message. The same placement applies on Anthropic, Amazon Bedrock and Google Vertex AI routes.
