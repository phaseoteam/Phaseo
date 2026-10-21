---
"@phaseo/gateway-api": patch
---

Bill prompt caching correctly on every provider, streamed or not. Claude streams now bill cache writes and uncached input from the upstream usage; providers that count cache writes inside input (OpenAI and Azure GPT-5.6+, Kimi, Alibaba, Venice) no longer pay for writes twice; top-level `cached_tokens` and `prompt_cache_hit_tokens` are read; and a cache meter without a price row bills at the input rate with a logged fallback instead of failing the request. Client usage now follows OpenAI semantics: `input_tokens` includes cache reads and writes, and writes are reported in `input_tokens_details.cache_write_tokens` (`prompt_tokens_details` on Chat). OTel and Axiom report cache reads and writes from the priced meters.
