---
"@phaseo/gateway-api": patch
---

Support OpenAI's 12-hour prompt cache on GPT-5.6 and later. `prompt_cache_options.ttl: "12h"` and a `ttl` on `prompt_cache_breakpoint` now reach OpenAI; Chat Completions requests that ask for 12 hours run on OpenAI's Responses API, where OpenAI documents it. Routes that cannot take a 12-hour cache, such as Azure OpenAI, get the request with the 30-minute default and report the removed field in `X-Phaseo-Dropped-Params`; routes that take it are tried first. 12-hour cache writes are now billed at OpenAI's published 2.5x input rate and 30-minute writes at 1.25x (12-hour writes were previously billed at the 30-minute rate). Responses usage returns `input_tokens_details.cache_write_tokens_details` with `ttl_30m_tokens` and `ttl_12h_tokens`, and conversations that use a 12-hour cache stay on their provider for 18 hours.
