---
"@phaseo/gateway-api": patch
---

Billing now covers server-side tool calls and reasoning that some providers reported but the gateway charged at $0:

- Claude web search is billed at $10 per 1,000 searches on `anthropic-us`, `anthropic-aws` and `anthropic-aws-us` as well as `anthropic`, and OpenAI web search at $10 per 1,000 calls on `openai-eu`, when a route has no price row of its own.
- xAI (`spacex-ai`): reasoning tokens, which xAI reports outside `output_tokens`, are now part of the output and billed, on buffered and streamed requests. Usage returned to clients counts them inside `output_tokens`, as OpenAI does. Web search, code execution and X search (per post and per user profile) are billed from `server_side_tool_usage_details`. `json_schema` structured outputs are sent to xAI as `json_schema` instead of being downgraded to `json_object` with a prompt instruction.
- Venice: a request that ran Venice web search (citations returned, or `enable_web_search: "on"`) is billed one web search request.
- Meta: each completed `web_search_call` on a buffered response is billed as one search query ($2.50 per 1,000).
- Claude's reported `usage.inference_geo` reaches pricing, so price rows can charge the 1.1x US-only rate.
- Streamed `/v1/responses` and `/v1/messages` usage from OpenAI-compatible providers now keeps `server_tool_use` counts.
- The JSON-schema instruction that some providers need is added to a Responses system item as an `input_text` part, not an invalid `text` part.
