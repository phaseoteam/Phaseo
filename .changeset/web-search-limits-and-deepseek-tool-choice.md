---
"@phaseo/gateway-api": patch
"@phaseo/docs": patch
---

Web search now enforces its limits across the whole request, and DeepSeek honours a forced `tool_choice`.

- `max_total_results` counts results from every search round in a request, not only the current round.
- Exa search uses `user_location.country` for regional results.
- A native web search with `max_results`, `max_total_results` or `max_uses` that the provider's own search can't enforce runs on Phaseo's search instead. This covers OpenAI and xAI, and the result caps on Claude. OpenAI's `web_search` tool now carries `max_total_results` when it is mapped to Phaseo's search.
- When DeepSeek is the provider, a forced `tool_choice` (`"required"` or a named tool) is kept and thinking is turned off for that request. Previously the choice was silently dropped when the request set reasoning. Without reasoning settings it was sent as is, and DeepSeek rejects that in thinking mode, which is its default.
