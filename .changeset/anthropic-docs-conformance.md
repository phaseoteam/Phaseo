---
"@phaseo/gateway-api": patch
---

Match Claude's documented request and billing behaviour:

- Turning reasoning off now follows Anthropic's per-model table. Sonnet 5.5 gets `thinking: {type: "between_tools"}` instead of `disabled`, which it rejects with a 400. Opus 4.7, Opus 4.8 and Opus 5 get `disabled` instead of adaptive thinking, which turned thinking on.
- Fast-mode responses (`usage.speed: "fast"`) are billed at the fast price on streamed and buffered requests. Before, the `service_tier: "standard"` beside them won.
- `/v1/messages` now accepts `output_config` (effort and structured output) and `inference_geo`, `thinking: {type: "between_tools"}`, and effort `xhigh`. Effort `max` reaches Claude as `max` instead of `xhigh`.
- Effort is only sent at levels a model supports: none on Haiku 4.5 and Sonnet 4.5, up to `high` on Opus 4.5, and `max` instead of `xhigh` on the 4.6 models. `inference_geo: "global"` is no longer sent to the 4.5 models, which reject it.
- `parallel_tool_calls: false` disables parallel tool use when the request has tools but no `tool_choice`.
- Web search `user_location` reaches Claude flat when a client used OpenAI's nested shape. The newer `web_search_20260318` and `web_fetch_*` tool versions are recognised. `metadata.user_id` can be up to 512 characters.
