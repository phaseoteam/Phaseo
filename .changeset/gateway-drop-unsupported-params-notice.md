---
"@phaseo/gateway-api": patch
---

Drop request parameters the serving provider does not support instead of forwarding them, and report them. Optional sampling parameters (`temperature`, `top_p`, `top_k`, `min_p`, `repetition_penalty`, `frequency_penalty`, `presence_penalty`, `logit_bias`, `logprobs`, `top_logprobs`, `seed`, `stop`) are dropped when the provider profile marks them unsupported or the route's catalogue parameters do not list them. `parallel_tool_calls`, `max_tool_calls` and `image_config` are dropped only when the provider profile marks them unsupported. Routes without declared parameters keep everything. Dropped parameters are named in the `X-Phaseo-Dropped-Params` response header and in `meta.routing.dropped_params`, and are recorded in the routing diagnostics.
