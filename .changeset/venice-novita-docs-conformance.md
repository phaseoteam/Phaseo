---
"@phaseo/gateway-api": patch
---

Venice text requests for models other than its native `openai-*` models now go to `/chat/completions` instead of Venice's beta `/responses`, which ignores structured output and most `venice_parameters` for those models. Novita receives `enable_thinking` and `separate_reasoning` for every model when a client sets reasoning, instead of only for a fixed list of mostly retired models.
