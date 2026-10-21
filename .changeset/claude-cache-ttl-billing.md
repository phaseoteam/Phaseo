---
"@phaseo/gateway-api": patch
---

Claude prompt-cache writes now bill at the documented 5-minute and 1-hour rates on every route. On routes with a single cache-write price (for example Claude on Azure), 1-hour writes are billed at 2× the input rate instead of the 5-minute price, and the pricing line is marked `pricing_fallback: "input_rate"`. Cache writes a streamed Claude response reports in its final cumulative total, beyond the 5-minute and 1-hour split sent at the start of the stream, are now billed, and Chat Completions and Responses usage reports that full total in `cache_write_tokens`.

On Amazon Bedrock and Google Vertex AI, Claude 3.7 Sonnet, 3.5 Sonnet and 3 Opus cache for 5 minutes only. Cache breakpoints for those models are now sent without `ttl` instead of with a value the provider can reject, and a removed `1h` is reported as `cache_control.ttl` in `X-Phaseo-Dropped-Params` and `meta.routing.dropped_params`.
