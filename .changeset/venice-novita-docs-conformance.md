---
"@phaseo/gateway-api": patch
---

Venice text requests for models other than its native `openai-*` models now go to `/chat/completions` instead of Venice's beta `/responses`, which ignores structured output and most `venice_parameters` for those models. Novita receives `enable_thinking` and `separate_reasoning` for every model when a client sets reasoning, instead of only for a fixed list of mostly retired models.

Atlas Cloud now receives a client's reasoning setting as `thinking: {type: "enabled" | "disabled"}`, the field its chat API documents. Before, reasoning settings were not sent to Atlas at all.

Nebius Token Factory now receives `service_tier: "default"` for standard (its enum has no `standard`) and keeps `reasoning_effort: "max"`. Cohere receives `reasoning_effort: "none"` when a client turns reasoning off, instead of `high`. io.net receives `reasoning: {effort}`, clamped to its documented none to high, instead of no reasoning setting at all.

MiniMax-M3.1-Flash no longer receives `thinking: {type: "disabled"}`, which it rejects with a 400, and now receives `reasoning_effort` from `low` to `max`. Grok 4.3, 4.6 and 4.7 keep their documented effort levels, including `xhigh` and, on 4.3, `none`; before, they were clamped to low, medium or high.

Mistral and Mistral EU no longer receive `user` or `web_search_options`, which their API rejects as unknown fields. Temperature is capped at the documented 1.5, `service_tier: "standard"` is sent as `standard_only`, and reasoning effort uses the documented `none` to `xhigh` (it allowed `max`, which Mistral does not accept). Fireworks now receives `service_tier: "default"` for standard.

Upstage now receives `stream_options`, so streamed Solar requests return the usage they are billed from (Upstage sends no usage on a stream without `include_usage`). Asking for no reasoning sends `none` instead of being raised to `low`, which turned reasoning on.

Groq receives `service_tier: "on_demand"` (Chat) or `"default"` (Responses) for standard, and gpt-oss on Groq no longer receives reasoning effort values it rejects with a 400. Wafer receives `low` for `minimal` effort, which its Chat Completions rejects, and its request fixes now also apply to Wafer ZDR.

DeepSeek requests on its Responses API carry reasoning effort as `reasoning.effort`, the field it reads there, instead of being ignored. gpt-oss on Cerebras no longer receives `reasoning_effort: "none"`, which it does not accept.

Earlier turns' `reasoning_content` now reaches Baseten, Arcee, Together, DeepInfra and Wafer ZDR in tool loops; Baseten's Beam returns 400 without it. Reflection no longer receives `max_tool_calls` or `background`, which it rejects.
