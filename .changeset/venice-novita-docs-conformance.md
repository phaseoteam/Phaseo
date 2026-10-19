---
"@phaseo/gateway-api": patch
---

Venice text requests for models other than its native `openai-*` models now go to `/chat/completions` instead of Venice's beta `/responses`, which ignores structured output and most `venice_parameters` for those models. Novita receives `enable_thinking` and `separate_reasoning` for every model when a client sets reasoning, instead of only for a fixed list of mostly retired models.

Atlas Cloud now receives a client's reasoning setting as `thinking: {type: "enabled" | "disabled"}`, the field its chat API documents. Before, reasoning settings were not sent to Atlas at all.

Nebius Token Factory now receives `service_tier: "default"` for standard (its enum has no `standard`) and keeps `reasoning_effort: "max"`. Cohere receives `reasoning_effort: "none"` when a client turns reasoning off, instead of `high`. io.net receives `reasoning: {effort}`, clamped to its documented none to high, instead of no reasoning setting at all.

MiniMax-M3.1-Flash no longer receives `thinking: {type: "disabled"}`, which it rejects with a 400, and now receives `reasoning_effort` from `low` to `max`. Grok 4.3, 4.6 and 4.7 keep their documented effort levels, including `xhigh` and, on 4.3, `none`; before, they were clamped to low, medium or high.
